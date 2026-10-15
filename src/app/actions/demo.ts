"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { addGateDemo, createDemoCondominium, deleteDemoCondominium } from "@/lib/demo-condo";
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

export type GateDemoState = { error?: string; message?: string } | null;

/** Acrescenta porteiro, pessoas nas unidades, reservas e entradas fictícias a um condomínio que já existe. */
export async function addGateDemoAction(id: string, _prev: GateDemoState): Promise<GateDemoState> {
  const me = await requireUser("superadmin");
  if (me.impersonator) return { error: "Indisponível em modo de visualização." };
  try {
    const r = await addGateDemo(id);
    await audit(me, "demo_gate", "condominium", id, { new: { porteiro: r.doorman, reservas: r.bookings, pessoas: r.people, entradas: r.entries }, condominiumId: id });
    revalidatePath(`/admin/condominios/${id}`);
    revalidatePath("/reservas");
    revalidatePath("/portaria");
    return { message: `Pronto: porteiro ${r.doorman}, ${r.bookings} reservas em ${r.areas} área(s), ${r.people} pessoas nas unidades e ${r.entries} entradas na portaria.` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível gerar os dados." };
  }
}
