"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ADMIN_CONDO_COOKIE } from "@/lib/admin-scope";
import { activateMembership } from "@/lib/memberships";

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

/** Quem tem vínculo com vários condomínios (síndico profissional, prestador…) troca o condomínio ativo. */
export async function switchCondo(condominiumId: string) {
  const user = await requireUser("syndic", "caretaker", "provider", "council", "resident");
  const m = await activateMembership(user.id, condominiumId);
  if (!m) return;
  revalidatePath("/", "layout");
}

/** "Meus condomínios": abre um condomínio (troca o ativo) e vai para o painel dele. */
export async function openCondo(condominiumId: string) {
  const user = await requireUser("syndic", "caretaker", "provider", "council", "resident");
  await activateMembership(user.id, condominiumId);
  revalidatePath("/", "layout");
  redirect("/dashboard");
}
