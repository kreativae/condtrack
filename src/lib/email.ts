import "server-only";
import nodemailer from "nodemailer";
import { getSettings, type SettingsValues } from "./settings";

export type EmailMessage = { to: string | string[]; subject: string; html: string; text: string };
export type SendResult = { ok: true; id?: string } | { ok: false; error: string };

export async function emailConfig(overrides?: SettingsValues) {
  const s = { ...(await getSettings("email")), ...overrides };
  const str = (v: unknown) => (v == null ? "" : String(v));
  const c = {
    enabled: !!s.enabled,
    provider: (str(s.provider) || "resend") as "resend" | "smtp",
    fromName: str(s.fromName) || "Condtrack",
    fromEmail: str(s.fromEmail),
    replyTo: str(s.replyTo),
    resendApiKey: str(s.resendApiKey),
    smtpHost: str(s.smtpHost),
    smtpPort: Number(s.smtpPort ?? 587),
    smtpUser: str(s.smtpUser),
    smtpPass: str(s.smtpPass),
    notifyByEmail: s.notifyByEmail !== false,
    sendInvites: s.sendInvites !== false,
  };
  const ready = !!c.fromEmail && (c.provider === "resend" ? !!c.resendApiKey : !!c.smtpHost && !!c.smtpUser && !!c.smtpPass);
  return { ...c, ready, active: c.enabled && ready };
}

type Config = Awaited<ReturnType<typeof emailConfig>>;

function from(c: Config) {
  return `${c.fromName.replace(/[<>"]/g, "")} <${c.fromEmail}>`;
}

/** Envia um e-mail pelo provedor configurado. Nunca lança — retorna o erro. */
export async function sendEmail(msg: EmailMessage, config?: Config): Promise<SendResult> {
  const c = config ?? (await emailConfig());
  if (!c.ready) return { ok: false, error: "E-mail não configurado." };
  try {
    if (c.provider === "resend") {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${c.resendApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: from(c),
          to: Array.isArray(msg.to) ? msg.to : [msg.to],
          subject: msg.subject,
          html: msg.html,
          text: msg.text,
          ...(c.replyTo ? { reply_to: c.replyTo } : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
      if (!res.ok) return { ok: false, error: data.message ?? `Resend respondeu ${res.status}` };
      return { ok: true, id: data.id };
    }
    const port = c.smtpPort;
    const transport = nodemailer.createTransport({
      host: c.smtpHost,
      port,
      secure: port === 465,
      auth: { user: c.smtpUser, pass: c.smtpPass },
      connectionTimeout: 10_000,
    });
    const info = await transport.sendMail({
      from: from(c),
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      ...(c.replyTo ? { replyTo: c.replyTo } : {}),
    });
    return { ok: true, id: info.messageId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ───────────────────────────── Modelo visual ─────────────────────────────

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Layout de e-mail com a identidade Condtrack (tabelas + estilos inline para compatibilidade). */
export function renderEmail(opts: { title: string; intro?: string; lines?: string[]; cta?: { label: string; url: string }; footnote?: string; preheader?: string }) {
  const body = [opts.intro, ...(opts.lines ?? [])].filter(Boolean) as string[];
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f6f7f9;font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;color:#0f172a">
<span style="display:none;max-height:0;overflow:hidden">${esc(opts.preheader ?? opts.intro ?? opts.title)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f9;padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="padding:0 4px 20px"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="background:#5b5bd6;border-radius:10px;width:34px;height:34px;text-align:center;color:#fff;font-weight:700;font-size:16px">✓</td>
<td style="padding-left:10px;font-size:19px;font-weight:700;letter-spacing:-0.3px">Cond<span style="color:#5b5bd6">track</span></td>
</tr></table></td></tr>
<tr><td style="background:#ffffff;border:1px solid #e6e8ee;border-radius:16px;padding:32px">
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;letter-spacing:-0.4px">${esc(opts.title)}</h1>
${body.map((l) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#334155">${esc(l)}</p>`).join("")}
${opts.cta ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px"><tr><td style="background:#5b5bd6;border-radius:10px"><a href="${esc(opts.cta.url)}" style="display:inline-block;padding:12px 22px;color:#ffffff;font-weight:600;font-size:14px;text-decoration:none">${esc(opts.cta.label)}</a></td></tr></table>` : ""}
${opts.footnote ? `<p style="margin:20px 0 0;font-size:12px;line-height:1.5;color:#64748b">${esc(opts.footnote)}</p>` : ""}
</td></tr>
<tr><td style="padding:20px 4px;font-size:12px;color:#94a3b8;text-align:center">Condtrack · Gestão condominial<br>Você recebeu este e-mail por ter acesso ao Condtrack.</td></tr>
</table></td></tr></table></body></html>`;
  const text = [opts.title, "", ...body, ...(opts.cta ? ["", `${opts.cta.label}: ${opts.cta.url}`] : []), ...(opts.footnote ? ["", opts.footnote] : [])].join("\n");
  return { html, text };
}
