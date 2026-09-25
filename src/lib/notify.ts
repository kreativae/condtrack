import "server-only";
import { after } from "next/server";
import { db } from "./db";
import type { Role } from "./roles";
import { emailConfig, renderEmail, sendEmail } from "./email";
import { appUrl } from "./url";
import { renderTemplate } from "./messages-server";

type Target = { condominiumId: string; roles?: Role[]; userIds?: (string | null | undefined)[]; exclude?: string };
type Vars = Record<string, string | number | null | undefined>;
/** `type` é a chave do modelo em Configurações → Mensagens; `vars` preenche o texto. */
type Payload = { type: string; vars: Vars; referenceType?: string; referenceId?: string };

function linkFor(n: Payload, layout: (k: string) => string) {
  if (n.referenceType === "service_order" && n.referenceId) return { path: `/os/${n.referenceId}`, label: layout("ctaOrder") };
  if (n.referenceType === "announcement") return { path: "/comunicados", label: layout("ctaAnnouncement") };
  if (n.referenceType === "billing") return { path: "/assinatura", label: layout("ctaBilling") };
  return { path: "/notificacoes", label: layout("ctaDefault") };
}

/** Notificação in-app + e-mail, conforme o modelo e os canais ligados em Mensagens. */
export async function notify(target: Target, n: Payload) {
  const condo = await db.condominium.findUnique({ where: { id: target.condominiumId }, select: { name: true } });
  const msg = await renderTemplate(n.type, { condominio: condo?.name, ...n.vars });
  if (!msg.app && !msg.email) return;

  const ids = new Set<string>(target.userIds?.filter((x): x is string => !!x));
  if (target.roles?.length) {
    const users = await db.user.findMany({
      where: { condominiumId: target.condominiumId, role: { in: target.roles }, status: "active" },
      select: { id: true },
    });
    users.forEach((u) => ids.add(u.id));
  }
  if (target.exclude) ids.delete(target.exclude);
  if (!ids.size) return;
  const row = { type: n.type, title: msg.title, message: msg.message, referenceType: n.referenceType, referenceId: n.referenceId };
  if (msg.app) await db.notification.createMany({ data: [...ids].map((userId) => ({ userId, ...row })) });

  if (!msg.email) return;
  const cfg = await emailConfig();
  if (!cfg.active || !cfg.notifyByEmail) return;
  const base = await appUrl(); // precisa do request — calcular antes do after()
  const recipients = await db.user.findMany({ where: { id: { in: [...ids] }, status: "active" }, select: { email: true, name: true } });
  const layout = await renderTemplate("email_layout", {});
  const link = linkFor(n, layout.get);

  // Envia depois da resposta para não atrasar a ação do usuário
  after(async () => {
    const results = await Promise.allSettled(
      recipients.map(async (r) => {
        const greet = await renderTemplate("email_layout", { nome: r.name.split(" ")[0] });
        const { html, text } = renderEmail({
          title: msg.title,
          intro: greet.get("greeting"),
          lines: msg.message.split("\n"),
          cta: { label: link.label, url: `${base}${link.path}` },
          footnote: layout.get("footnote"),
          footer: layout.get("footer"),
        });
        return sendEmail({ to: r.email, subject: msg.title, html, text }, cfg, n.type);
      }),
    );
    const failed = results.filter((x) => x.status === "rejected" || (x.status === "fulfilled" && !x.value.ok));
    if (failed.length) console.error(`[email] ${failed.length}/${results.length} notificações não enviadas (${n.type})`);
  });
}
