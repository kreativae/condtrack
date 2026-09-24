import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
import { SESSION_COOKIE, signSession, verifySession, type SessionPayload } from "./session-token";
import { getSettings } from "./settings";
import type { Role } from "./roles";

export async function setSessionCookie(payload: SessionPayload) {
  const ttl = Number((await getSettings("security")).sessionHours ?? 12) * 3600;
  const token = await signSession(payload, ttl);
  (await cookies()).set(SESSION_COOKIE, token, {
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
    include: {
      condominium: true,
      units: { include: { unit: { include: { building: true } } } },
    },
  });
}

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await getSession();
  if (!session) return null;
  const user = await loadUser(session.uid);
  if (!user || user.status !== "active") return null;

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
  if (!user) redirect("/login");
  if (roles.length && !roles.includes(user.role)) redirect("/dashboard");
  return user;
}
