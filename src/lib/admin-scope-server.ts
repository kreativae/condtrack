import "server-only";
import { cookies } from "next/headers";
import { db } from "./db";
import type { CurrentUser } from "./auth";
import { ADMIN_CONDO_COOKIE } from "./admin-scope";

/** Condomínio escolhido pelo superadmin no menu (null = todos; para os outros perfis, sempre null). */
export async function adminScope(user: CurrentUser) {
  if (user.role !== "superadmin") return null;
  const id = (await cookies()).get(ADMIN_CONDO_COOKIE)?.value;
  if (!id) return null;
  return db.condominium.findUnique({ where: { id }, select: { id: true, name: true } });
}
