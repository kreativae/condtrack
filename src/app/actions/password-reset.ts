"use server";

import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { emailConfig, renderEmail, sendEmail } from "@/lib/email";
import { renderTemplate } from "@/lib/messages-server";
import { appUrl } from "@/lib/url";
import { findValidReset, hashResetToken as hash } from "@/lib/password-reset";

export type ResetState = { error?: string; ok?: boolean; message?: string } | undefined;

const VALID_MINUTES = 60;
const MAX_PER_HOUR = 3;

/** Mesma resposta exista ou não a conta: não revela quem tem cadastro. */
const SENT: ResetState = {
  ok: true,
  message: "Se este e-mail tiver uma conta ativa, enviamos um link para criar uma nova senha. Confira a caixa de entrada e o spam. O link vale por 1 hora.",
};

/** "Esqueci minha senha": envia por e-mail um link de uso único para criar uma nova senha. */
export async function requestPasswordReset(_prev: ResetState, form: FormData): Promise<ResetState> {
  const parsed = z.string().trim().toLowerCase().email().safeParse(form.get("email"));
  if (!parsed.success) return { error: "Informe um e-mail válido." };

  const cfg = await emailConfig();
  if (!cfg.active) return { error: "O envio de e-mails não está ativo nesta instalação. Peça à administração do condomínio para redefinir a sua senha." };

  const user = await db.user.findUnique({ where: { email: parsed.data } });
  if (!user || user.status !== "active") return SENT;

  // Limite de pedidos por conta (evita encher a caixa de alguém)
  const recent = await db.passwordReset.count({ where: { userId: user.id, createdAt: { gte: new Date(Date.now() - 3600_000) } } });
  if (recent >= MAX_PER_HOUR) return SENT;

  const token = randomBytes(32).toString("base64url");
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip");
  await db.passwordReset.create({ data: { userId: user.id, tokenHash: hash(token), expiresAt: new Date(Date.now() + VALID_MINUTES * 60_000), ipAddress: ip } });

  const t = await renderTemplate("password_forgot", { nome: user.name.split(" ")[0], validade: "1 hora" });
  const layout = await renderTemplate("email_layout", {});
  const { html, text } = renderEmail({
    title: t.title,
    lines: t.message.split("\n"),
    cta: { label: t.get("cta"), url: `${await appUrl()}/redefinir-senha?token=${token}` },
    footnote: t.get("footnote"),
    footer: layout.get("footer"),
  });
  await sendEmail({ to: user.email, subject: t.get("subject"), html, text }, cfg, "password_forgot");
  await audit({ id: user.id, condominiumId: user.condominiumId, impersonator: null }, "password_reset_requested", "user", user.id, { condominiumId: user.condominiumId });
  return SENT;
}

/** Define a nova senha pelo link do e-mail. */
export async function resetPasswordWithToken(_prev: ResetState, form: FormData): Promise<ResetState> {
  const token = String(form.get("token") ?? "");
  const next = String(form.get("password") ?? "");
  if (next.length < 8) return { error: "A nova senha deve ter ao menos 8 caracteres." };
  if (next !== form.get("confirm")) return { error: "As senhas não conferem." };
  const r = await findValidReset(token);
  if (!r) return { error: "Este link é inválido ou já venceu. Peça um novo em “Esqueci minha senha”." };

  await db.$transaction([
    // Nova senha e, de quebra, libera um bloqueio por tentativas erradas
    db.user.update({ where: { id: r.userId }, data: { passwordHash: await bcrypt.hash(next, 10), failedLogins: 0, lockedUntil: null } }),
    db.passwordReset.update({ where: { id: r.id }, data: { usedAt: new Date() } }),
    // Outros links pendentes deixam de valer
    db.passwordReset.deleteMany({ where: { userId: r.userId, usedAt: null, id: { not: r.id } } }),
  ]);
  await audit({ id: r.user.id, condominiumId: r.user.condominiumId, impersonator: null }, "password_reset_completed", "user", r.user.id, { condominiumId: r.user.condominiumId });
  return { ok: true, message: "Senha alterada! Já pode entrar com a nova senha." };
}
