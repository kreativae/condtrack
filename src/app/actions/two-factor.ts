"use server";

import QRCode from "qrcode";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { HIDE_2FA_TIP_COOKIE, requireUser, setSessionCookie } from "@/lib/auth";
import { decryptSecret, encryptSecret, getSettings } from "@/lib/settings";
import { PENDING_2FA_COOKIE, verifyPending2fa } from "@/lib/session-token";
import { consumeRecoveryCode, newRecoveryCodes, newTotpSecret, otpauthUri, verifyTotp } from "@/lib/totp";

export type TwoFactorState = { error?: string; codes?: string[]; ok?: boolean } | null;

const code = (form: FormData) => String(form.get("code") ?? "").trim();

async function me() {
  const user = await requireUser();
  if (user.impersonator) return { user, error: "Indisponível em modo de visualização." };
  return { user, error: null };
}

/** Confere um código do app (ou de recuperação) do usuário. Atualiza o passo/lista usados. */
async function checkCode(userId: string, input: string, allowRecovery: boolean) {
  const u = await db.user.findUnique({ where: { id: userId }, select: { totpSecret: true, totpLastStep: true, recoveryCodes: true } });
  if (!u?.totpSecret) return null;
  const step = verifyTotp(decryptSecret(u.totpSecret), input, u.totpLastStep);
  if (step != null) {
    await db.user.update({ where: { id: userId }, data: { totpLastStep: step } });
    return "app" as const;
  }
  if (!allowRecovery) return null;
  const left = consumeRecoveryCode(u.recoveryCodes, input);
  if (left == null) return null;
  await db.user.update({ where: { id: userId }, data: { recoveryCodes: left } });
  return "recovery" as const;
}

// ───── Configuração (Meu perfil)

/** Passo 1: gera um segredo novo (ainda não ativo) e o QR para o app autenticador. */
export async function startTwoFactorSetup(): Promise<{ error?: string; secret?: string; qr?: string }> {
  const { user, error } = await me();
  if (error) return { error };
  if (user.totpEnabledAt) return { error: "A verificação em duas etapas já está ativada." };
  const secret = newTotpSecret();
  await db.user.update({ where: { id: user.id }, data: { totpSecret: encryptSecret(secret), totpLastStep: null } });
  // QR sempre preto no branco: os leitores precisam de contraste, em qualquer tema
  const qr = await QRCode.toString(otpauthUri(secret, user.email), { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } });
  return { secret, qr };
}

/** Passo 2: confirma com o primeiro código do app, ativa e devolve os códigos de recuperação (mostrados uma vez). */
export async function confirmTwoFactor(_: TwoFactorState, form: FormData): Promise<TwoFactorState> {
  const { user, error } = await me();
  if (error) return { error };
  if (user.totpEnabledAt) return { error: "A verificação em duas etapas já está ativada." };
  if (!(await checkCode(user.id, code(form), false))) return { error: "Código incorreto. Confira o horário do celular e digite o código atual do app." };
  const { codes, stored } = newRecoveryCodes();
  await db.user.update({ where: { id: user.id }, data: { totpEnabledAt: new Date(), recoveryCodes: stored } });
  await audit(user, "2fa_enabled", "user", user.id);
  return { ok: true, codes };
}

/** Novos códigos de recuperação (os antigos deixam de valer). Pede um código do app. */
export async function regenerateRecoveryCodes(_: TwoFactorState, form: FormData): Promise<TwoFactorState> {
  const { user, error } = await me();
  if (error) return { error };
  if (!user.totpEnabledAt) return { error: "A verificação em duas etapas não está ativada." };
  if ((await checkCode(user.id, code(form), false)) !== "app") return { error: "Código do app incorreto." };
  const { codes, stored } = newRecoveryCodes();
  await db.user.update({ where: { id: user.id }, data: { recoveryCodes: stored } });
  await audit(user, "2fa_recovery_regenerated", "user", user.id);
  return { ok: true, codes };
}

/** Desativa as duas etapas. Pede um código do app ou de recuperação. */
export async function disableTwoFactor(_: TwoFactorState, form: FormData): Promise<TwoFactorState> {
  const { user, error } = await me();
  if (error) return { error };
  if (!user.totpEnabledAt) return { error: "A verificação em duas etapas não está ativada." };
  if (!(await checkCode(user.id, code(form), true))) return { error: "Código incorreto." };
  await db.user.update({ where: { id: user.id }, data: { totpSecret: null, totpEnabledAt: null, totpLastStep: null, recoveryCodes: "" } });
  await audit(user, "2fa_disabled", "user", user.id);
  revalidatePath("/perfil");
  return { ok: true };
}

/** Superadmin: desliga as duas etapas de alguém que perdeu o celular e os códigos. */
export async function adminResetTwoFactor(userId: string) {
  const admin = await requireUser("superadmin");
  const u = await db.user.findUnique({ where: { id: userId }, select: { id: true, condominiumId: true, totpEnabledAt: true } });
  if (!u?.totpEnabledAt) return;
  await db.user.update({ where: { id: userId }, data: { totpSecret: null, totpEnabledAt: null, totpLastStep: null, recoveryCodes: "" } });
  await audit(admin, "2fa_reset", "user", userId, { condominiumId: u.condominiumId });
  revalidatePath(`/admin/usuarios/${userId}`);
}

// ───── Login: segunda etapa

export type LoginCodeState = { error?: string } | undefined;

export async function verifyLoginCode(_: LoginCodeState, form: FormData): Promise<LoginCodeState> {
  const jar = await cookies();
  const pending = await verifyPending2fa(jar.get(PENDING_2FA_COOKIE)?.value);
  if (!pending) redirect("/login?expirou=1");

  const sec = await getSettings("security");
  const MAX_ATTEMPTS = Number(sec.maxLoginAttempts ?? 5);
  const LOCK_MINUTES = Number(sec.lockMinutes ?? 15);
  const user = await db.user.findUnique({ where: { id: pending.uid }, select: { id: true, condominiumId: true, status: true, failedLogins: true, lockedUntil: true, totpEnabledAt: true } });
  if (!user || user.status !== "active" || !user.totpEnabledAt) redirect("/login");
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return { error: `Acesso bloqueado por excesso de tentativas. Tente novamente em ${LOCK_MINUTES} minutos.` };
  }

  const actor = { id: user.id, condominiumId: user.condominiumId, impersonator: null };
  const how = await checkCode(user.id, code(form), true);
  if (!how) {
    const failed = user.failedLogins + 1;
    await db.user.update({
      where: { id: user.id },
      data: failed >= MAX_ATTEMPTS ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) } : { failedLogins: failed },
    });
    await audit(actor, "login_failed", "user", user.id, { new: { etapa: "código" } });
    return { error: "Código incorreto." };
  }

  await db.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
  jar.delete(PENDING_2FA_COOKIE);
  await setSessionCookie({ uid: user.id }, { login: true });
  await audit(actor, "login", "user", user.id, { new: { duasEtapas: how === "app" ? "app" : "código de recuperação" } });
  redirect(pending.next.startsWith("/") && !pending.next.startsWith("//") ? pending.next : "/dashboard");
}

/** Oculta o lembrete das duas etapas até o próximo login (cookie de sessão, apagado ao entrar de novo). */
export async function hideTwoFactorReminder() {
  await requireUser();
  (await cookies()).set(HIDE_2FA_TIP_COOKIE, "1", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
  revalidatePath("/dashboard");
}
