import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
import { SESSION_COOKIE, signSession, verifySession, type SessionPayload } from "./session-token";
import { getSettings } from "./settings";
import type { Role } from "./roles";

/** Avisos que a pessoa ocultou até o próximo login (ex.: lembrete das duas etapas). */
export const HIDE_2FA_TIP_COOKIE = "hide_2fa_tip";

/** `login: true` = novo acesso (senha, biometria, duas etapas): os avisos ocultados voltam a aparecer. */
export async function setSessionCookie(payload: SessionPayload, opts?: { login?: boolean }) {
  const ttl = Number((await getSettings("security")).sessionHours ?? 12) * 3600;
  const token = await signSession(payload, ttl);
  const jar = await cookies();
  if (opts?.login) jar.delete(HIDE_2FA_TIP_COOKIE);
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ttl,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

export const getSession = cache(async () => {
  return verifySession((await cookies()).get(SESSION_COOKIE)?.value);
});

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof loadUser>>> & {
  role: Role;
  /** Superadmin real, quando em modo "visualizar como". */
  impersonator: { id: string; name: string } | null;
};

function loadUser(id: string) {
  return db.user.findUnique({
    where: { id },
    // Segredos das duas etapas nunca saem daqui (o usuário carregado pode chegar a componentes)
    omit: { totpSecret: true, recoveryCodes: true },
    include: {
      condominium: true,
      units: { include: { unit: { include: { building: true } } } },
    },
  });
}

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await getSession();
  if (!session) return null;
  let user = await loadUser(session.uid);
  if (!user || user.status !== "active") return null;
  // Condomínio ativo arquivado: passa para outro vínculo; sem nenhum, a sessão não vale mais
  if (user.role !== "superadmin" && user.condominium?.deletedAt) {
    const other = await db.membership.findFirst({ where: { userId: user.id, condominium: { deletedAt: null } }, orderBy: { createdAt: "asc" } });
    if (!other) return null;
    await db.user.update({ where: { id: user.id }, data: { condominiumId: other.condominiumId, role: other.role, permissions: other.permissions } });
    user = await loadUser(session.uid);
    if (!user) return null;
  }

  let impersonator: CurrentUser["impersonator"] = null;
  if (session.actor && session.actor !== session.uid) {
    const actor = await db.user.findUnique({ where: { id: session.actor } });
    if (!actor || actor.role !== "superadmin") return null;
    impersonator = { id: actor.id, name: actor.name };
  }
  return { ...user, role: user.role as Role, impersonator };
});

export async function requireUser(...roles: Role[]) {
  const user = await getCurrentUser();
  // Sessão válida de quem não pode mais entrar (conta desativada, condomínio arquivado):
  // /api/sair limpa o cookie; sem isso, o proxy mandaria de volta do /login para o /dashboard sem fim
  if (!user) redirect((await getSession()) ? "/api/sair" : "/login");
  if (roles.length && !roles.includes(user.role)) redirect("/dashboard");
  return user;
}
