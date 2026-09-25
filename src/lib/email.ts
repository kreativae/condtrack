import "server-only";
import nodemailer from "nodemailer";
import { getSettings, type SettingsValues } from "./settings";
import { db } from "./db";

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

/**
 * Envia um e-mail pelo provedor configurado e registra no histórico
 * (Configurações → Mensagens). Nunca lança — retorna o erro.
 */
export async function sendEmail(msg: EmailMessage, config?: Config, type = "other"): Promise<SendResult> {
  const c = config ?? (await emailConfig());
  const res = await deliver(msg, c);
  await db.emailLog
    .create({
      data: {
        type,
        to: (Array.isArray(msg.to) ? msg.to.join(", ") : msg.to).slice(0, 500),
        subject: msg.subject.slice(0, 300),
        status: res.ok ? "sent" : "failed",
        error: res.ok ? null : res.error.slice(0, 500),
        provider: c.provider,
        providerId: res.ok ? (res.id ?? null) : null,
      },
    })
    .catch((e) => console.error("[email] não foi possível registrar o envio", e));
  return res;
}

async function deliver(msg: EmailMessage, c: Config): Promise<SendResult> {
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

// Layout HTML fica em email-render.ts (sem dependências de servidor: usado também na prévia do editor)
export { renderEmail } from "./email-render";
