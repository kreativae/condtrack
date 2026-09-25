import "server-only";
import { emailConfig, renderEmail, sendEmail } from "./email";
import { renderTemplate } from "./messages-server";
import { appUrl } from "./url";

/**
 * Aviso de segurança no endereço ANTIGO quando o e-mail de login muda
 * (modelo "email_changed" em Configurações → Mensagens). Não bloqueia a troca.
 */
export async function sendEmailChangedNotice(user: { name: string }, oldEmail: string, newEmail: string, author: string) {
  const cfg = await emailConfig();
  if (!cfg.active) return;
  const t = await renderTemplate("email_changed", { nome: user.name.split(" ")[0], email_antigo: oldEmail, email_novo: newEmail, autor: author });
  const layout = await renderTemplate("email_layout", {});
  const { html, text } = renderEmail({
    title: t.title,
    lines: t.message.split("\n"),
    cta: { label: t.get("cta"), url: `${await appUrl()}/login` },
    footnote: t.get("footnote"),
    footer: layout.get("footer"),
  });
  await sendEmail({ to: oldEmail, subject: t.get("subject"), html, text }, cfg, "email_changed");
}
