"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getSettings } from "@/lib/settings";
import { verifyTurnstile } from "@/lib/turnstile";
import { clearSessionCookie, getCurrentUser, getSession, requireUser, setSessionCookie } from "@/lib/auth";

export type LoginState = { error?: string } | undefined;

export async function login(_: LoginState, form: FormData): Promise<LoginState> {
  const parsed = z
    .object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) })
    .safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: "Informe e-mail e senha válidos." };

  const sec = await getSettings("security");
  const MAX_ATTEMPTS = Number(sec.maxLoginAttempts ?? 5);
  const LOCK_MINUTES = Number(sec.lockMinutes ?? 15);
  if (!(await verifyTurnstile(String(form.get("cf-turnstile-response") ?? "")))) {
    return { error: "Não foi possível confirmar que você não é um robô. Tente novamente." };
  }

  const user = await db.user.findUnique({ where: { email: parsed.data.email } });
  const generic = { error: "E-mail ou senha incorretos." };
  if (!user) {
    await bcrypt.compare(parsed.data.password, "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalid12");
    return generic;
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return { error: `Acesso bloqueado por excesso de tentativas. Tente novamente em ${LOCK_MINUTES} minutos.` };
  }
  if (user.status !== "active") return { error: "Seu acesso está desativado. Fale com a administração." };

  const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!ok) {
    const failed = user.failedLogins + 1;
    await db.user.update({
      where: { id: user.id },
      data: failed >= MAX_ATTEMPTS ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) } : { failedLogins: failed },
    });
    await audit({ id: user.id, condominiumId: user.condominiumId, impersonator: null }, "login_failed", "user", user.id);
    return generic;
  }

  await db.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
  await setSessionCookie({ uid: user.id });
  await audit({ id: user.id, condominiumId: user.condominiumId, impersonator: null }, "login", "user", user.id);

  const next = String(form.get("next") ?? "");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
}

export async function logout() {
  const user = await getCurrentUser();
  if (user) await audit(user, "logout", "user", user.id);
  await clearSessionCookie();
  redirect("/login");
}

/** Superadmin: visualizar a plataforma como outro usuário. */
export async function impersonate(userId: string) {
  const me = await requireUser("superadmin");
  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target || target.id === me.id) return;
  await setSessionCookie({ uid: target.id, actor: me.id });
  await audit(me, "impersonate_start", "user", target.id, { condominiumId: target.condominiumId });
  redirect("/dashboard");
}

export async function stopImpersonating() {
  const session = await getSession();
  if (!session?.actor) redirect("/dashboard");
  await setSessionCookie({ uid: session.actor });
  redirect("/admin/usuarios");
}
