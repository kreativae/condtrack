"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ADMIN_CONDO_COOKIE } from "@/lib/admin-scope";

/** Superadmin escolhe o condomínio em foco (vazio = todos). Vale para todas as páginas. */
export async function setAdminScope(id: string) {
  await requireUser("superadmin");
  const jar = await cookies();
  if (id && (await db.condominium.findUnique({ where: { id }, select: { id: true } }))) {
    jar.set(ADMIN_CONDO_COOKIE, id, { path: "/", maxAge: 31536000, sameSite: "lax" });
  } else {
    jar.delete(ADMIN_CONDO_COOKIE);
  }
  revalidatePath("/", "layout");
}
