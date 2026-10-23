"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { addGateDemo, createDemoCondominium, deleteDemoCondominium } from "@/lib/demo-condo";
import { ADMIN_CONDO_COOKIE } from "@/lib/admin-scope";
import { DEMO_ACCOUNTS_KEY, DEMO_SLOTS, normalizeDemoAccounts } from "@/lib/demo-accounts";

/** `values`: o que foi digitado, para a janela não perder os e-mails quando volta com erro */
export type DemoState = { error?: string; values?: Record<string, string> } | null;

/**
 * Cria o condomínio de demonstração com o síndico escolhido pelo e-mail e, opcionalmente, contas reais para zelador,
 * porteiro, conselho, morador e prestador (no lugar das fictícias). Os e-mails ficam salvos para a próxima vez.
 */
export async function createDemoCondo(_prev: DemoState, form: FormData): Promise<DemoState> {
  const me = await requireUser("superadmin");
  const values = Object.fromEntries(DEMO_SLOTS.map((s) => [s.key, String(form.get(s.key) ?? "")]));
  const { accounts, error } = normalizeDemoAccounts(values);
  if (error) return { error, values };

  // Cada e-mail precisa ser de uma conta ativa que não seja superadmin
  const found = await db.user.findMany({ where: { email: { in: Object.values(accounts) } }, select: { email: true, role: true, status: true } });
  for (const s of DEMO_SLOTS) {
    const email = accounts[s.key];
    if (!email) continue;
    const u = found.find((x) => x.email === email);
    if (!u) return { error: `${s.label}: nenhum usuário com ${email}. Cadastre a pessoa antes em Usuários.`, values };
    if (u.role === "superadmin") return { error: `${s.label}: o superadmin já vê todos os condomínios; escolha outro usuário.`, values };
    if (u.status !== "active") return { error: `${s.label}: a conta ${email} está desativada.`, values };
  }

  await db.setting.upsert({
    where: { key: DEMO_ACCOUNTS_KEY },
    create: { key: DEMO_ACCOUNTS_KEY, value: JSON.stringify(accounts), updatedById: me.id },
    update: { value: JSON.stringify(accounts), updatedById: me.id },
  });
  const { syndic, ...real } = accounts;
  const condo = await createDemoCondominium({ syndicEmail: syndic!, real });
  await audit(me, "create", "condominium", condo.id, { new: { name: condo.name, demo: true, contas: accounts }, condominiumId: condo.id });
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
