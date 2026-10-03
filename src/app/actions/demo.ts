"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { createDemoCondominium, deleteDemoCondominium } from "@/lib/demo-condo";
import { ADMIN_CONDO_COOKIE } from "@/lib/admin-scope";

export type DemoState = { error?: string } | null;

/** Cria o condomínio de demonstração e vincula a pessoa escolhida (pelo e-mail) como síndico. */
export async function createDemoCondo(_prev: DemoState, form: FormData): Promise<DemoState> {
  const me = await requireUser("superadmin");
  const parsed = z.string().trim().toLowerCase().email().safeParse(form.get("email"));
  if (!parsed.success) return { error: "Informe um e-mail válido." };
  const email = parsed.data;
  const target = await db.user.findUnique({ where: { email }, select: { role: true } });
  if (!target) return { error: "Nenhum usuário com esse e-mail. Cadastre a pessoa antes em Usuários." };
  if (target.role === "superadmin") return { error: "O superadmin já vê todos os condomínios; escolha outro usuário." };

  const condo = await createDemoCondominium({ syndicEmail: email });
  await audit(me, "create", "condominium", condo.id, { new: { name: condo.name, demo: true, syndic: email }, condominiumId: condo.id });
  revalidatePath("/admin/condominios");
  redirect(`/admin/condominios/${condo.id}`);
}

/** Exclui um condomínio de demonstração (só os marcados como demo) e tudo o que foi gerado nele. */
export async function deleteDemoCondo(id: string) {
  const me = await requireUser("superadmin");
  const done = await deleteDemoCondominium(id);
  if (!done) redirect(`/admin/condominios/${id}`);
  await audit(me, "delete", "condominium", id, { old: { name: done.name, demo: true, pessoasFicticias: done.people, ordens: done.orders }, condominiumId: null });
  const jar = await cookies();
  if (jar.get(ADMIN_CONDO_COOKIE)?.value === id) jar.delete(ADMIN_CONDO_COOKIE);
  revalidatePath("/", "layout");
  redirect("/admin/condominios");
}
