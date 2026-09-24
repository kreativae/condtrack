import "server-only";
import { after } from "next/server";
import { db } from "./db";
import type { Role } from "./roles";
import { emailConfig, renderEmail, sendEmail } from "./email";
import { appUrl } from "./url";

type Target = { condominiumId: string; roles?: Role[]; userIds?: (string | null | undefined)[]; exclude?: string };
type Payload = { type: string; title: string; message: string; referenceType?: string; referenceId?: string };

function linkFor(n: Payload) {
  if (n.referenceType === "service_order" && n.referenceId) return { path: `/os/${n.referenceId}`, label: "Ver ordem de serviço" };
  if (n.referenceType === "announcement") return { path: "/comunicados", label: "Ler comunicado" };
  if (n.referenceType === "billing") return { path: "/assinatura", label: "Ver assinatura" };
  return { path: "/notificacoes", label: "Abrir o Condtrack" };
}

/** Notificação in-app + e-mail (quando ativado em Configurações → E-mail). */
export async function notify(target: Target, n: Payload) {
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
  await db.notification.createMany({ data: [...ids].map((userId) => ({ userId, ...n })) });

  const cfg = await emailConfig();
  if (!cfg.active || !cfg.notifyByEmail) return;
  const base = await appUrl(); // precisa do request — calcular antes do after()
  const recipients = await db.user.findMany({ where: { id: { in: [...ids] }, status: "active" }, select: { email: true, name: true } });
  const link = linkFor(n);

  // Envia depois da resposta para não atrasar a ação do usuário
  after(async () => {
    const results = await Promise.allSettled(
      recipients.map((r) => {
        const { html, text } = renderEmail({
          title: n.title,
          intro: `Olá, ${r.name.split(" ")[0]}.`,
          lines: [n.message],
          cta: { label: link.label, url: `${base}${link.path}` },
          footnote: "Você pode acompanhar todas as notificações no sino do Condtrack.",
        });
        return sendEmail({ to: r.email, subject: n.title, html, text }, cfg);
      }),
    );
    const failed = results.filter((x) => x.status === "rejected" || (x.status === "fulfilled" && !x.value.ok));
    if (failed.length) console.error(`[email] ${failed.length}/${results.length} notificações não enviadas (${n.type})`);
  });
}
