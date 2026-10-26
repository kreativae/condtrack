import "server-only";
import { db } from "./db";
import { notify } from "./notify";
import { emailConfig, renderEmail, sendEmail } from "./email";
import { renderTemplate } from "./messages-server";
import { appUrl } from "./url";
import { ROLE_LABEL } from "./roles";
import { DEMO_PASSWORD, isExternalDemoEmail } from "./demo-accounts";
import { inviteAccountLines } from "./demo-trial";

/**
 * Avisa os superadmins das demonstrações externas cujo prazo acabou (uma vez por prazo: prorrogar zera o aviso).
 * Chamado pelo cron a cada 15 min e ao abrir a lista de condomínios. O `updateMany` condicional garante um aviso só,
 * mesmo com duas chamadas ao mesmo tempo.
 */
export async function notifyExpiredDemos(nowMs: number) {
  const now = new Date(nowMs);
  const due = await db.condominium.findMany({
    where: { demo: true, deletedAt: null, demoExpiresAt: { lte: now }, demoExpiredNotifiedAt: null },
    select: { id: true, name: true, demoExpiresAt: true, demoContactName: true, demoContactEmail: true, demoContactPhone: true },
  });
  if (!due.length) return 0;
  const admins = await db.user.findMany({ where: { role: "superadmin", status: "active" }, select: { id: true } });
  let sent = 0;
  for (const c of due) {
    const claimed = await db.condominium.updateMany({ where: { id: c.id, demoExpiredNotifiedAt: null }, data: { demoExpiredNotifiedAt: now } });
    if (!claimed.count) continue;
    const contato = [c.demoContactName, c.demoContactEmail, c.demoContactPhone].filter(Boolean).join(" · ");
    await notify(
      { condominiumId: c.id, userIds: admins.map((a) => a.id) },
      { type: "demo_expired", vars: { contato, fim: new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(c.demoExpiresAt!) }, referenceType: "condominium", referenceId: c.id },
    );
    sent++;
  }
  return sent;
}

/**
 * E-mail para quem testa a demonstração externa: as contas da série de teste (perfil e login), a senha padrão e o prazo.
 * Texto editável em Configurações → Mensagens (modelo `demo_invite`). Não depende de "enviar convites" ligado,
 * só do e-mail ativo: é o superadmin que pede o envio.
 */
export async function sendDemoInvite(condoId: string): Promise<{ ok: true; to: string } | { ok: false; error: string }> {
  const c = await db.condominium.findUnique({ where: { id: condoId }, select: { name: true, demo: true, deletedAt: true, demoExpiresAt: true, demoContactName: true, demoContactEmail: true } });
  if (!c?.demo || c.deletedAt) return { ok: false, error: "Demonstração não encontrada." };
  if (!c.demoContactEmail) return { ok: false, error: "Informe o e-mail de quem vai testar." };
  const cfg = await emailConfig();
  if (!cfg.active) return { ok: false, error: "O envio de e-mails está desligado. Ative em Configurações → E-mail." };
  const links = await db.membership.findMany({ where: { condominiumId: condoId, user: { status: "active" } }, select: { role: true, user: { select: { email: true } } } });
  const lines = inviteAccountLines(links.map((l) => ({ role: l.role, email: l.user.email })), ROLE_LABEL, isExternalDemoEmail);
  if (!lines.length) return { ok: false, error: "Esta demonstração não tem contas de teste (só a externa cria a série com a senha padrão)." };
  const prazo = c.demoExpiresAt ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(c.demoExpiresAt).replace(", ", " às ") : "";
  const t = await renderTemplate("demo_invite", { nome: c.demoContactName?.split(" ")[0] ?? "", condominio: c.name, contas: lines.join("\n"), senha: DEMO_PASSWORD, prazo });
  const layout = await renderTemplate("email_layout", {});
  const { html, text } = renderEmail({ title: t.title, lines: t.message.split("\n"), cta: { label: t.get("cta"), url: `${await appUrl()}/login` }, footnote: t.get("footnote"), footer: layout.get("footer") });
  const res = await sendEmail({ to: c.demoContactEmail, subject: t.get("subject"), html, text }, cfg, "demo_invite");
  if (!res.ok) return { ok: false, error: `Não foi possível enviar: ${res.error}` };
  await db.condominium.update({ where: { id: condoId }, data: { demoInviteSentAt: new Date() } });
  return { ok: true, to: c.demoContactEmail };
}
