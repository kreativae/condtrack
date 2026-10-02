"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { NAV } from "@/lib/nav";

/** Salva a ordem do menu do usuário (vazio = volta ao padrão do perfil). */
export async function saveNavOrder(order: string[]) {
  const user = await requireUser();
  // Em "visualizar como", não mexe no menu da pessoa visualizada
  if (user.impersonator) return;
  const allowed = new Set(NAV[user.role].map((i) => i.href));
  const clean = [...new Set(order.filter((h) => typeof h === "string" && allowed.has(h)))];
  await db.user.update({ where: { id: user.id }, data: { navOrder: clean.join(",") } });
  revalidatePath("/", "layout");
}
