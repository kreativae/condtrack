"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { addGateDemo, createDemoCondominium, deleteDemoCondominium } from "@/lib/demo-condo";
import { ADMIN_CONDO_COOKIE } from "@/lib/admin-scope";
import { DEMO_ACCOUNTS_KEY, DEMO_SLOTS, externalDemoAccounts, externalEmailFilter, nextExternalNumber, normalizeDemoAccounts } from "@/lib/demo-accounts";
import { parseTrialDays, trialEnd } from "@/lib/demo-trial";
import { sendDemoInvite } from "@/lib/demo-trial-server";

const TRIAL_FIELDS = ["days", "contactName", "contactEmail", "contactPhone"] as const;

/** Prazo e contato de quem testa (demonstração externa), lidos do formulário. */
function readTrial(form: FormData) {
  const get = (k: string) => String(form.get(k) ?? "").trim();
  const { days, error } = parseTrialDays(get("days"));
  if (error) return { error };
  const email = get("contactEmail").toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Contato: o e-mail não parece certo." };
  return { days: days!, contact: { demoContactName: get("contactName").slice(0, 120) || null, demoContactEmail: email.slice(0, 160) || null, demoContactPhone: get("contactPhone").slice(0, 40) || null } };
}

/** `values`: o que foi digitado, para a janela não perder os e-mails quando volta com erro */
export type DemoState = { error?: string; values?: Record<string, string>; mode?: "internal" | "external" } | null;

/** Número da próxima série externa (sindico3@, zelador3@…), calculado pelas contas que já existem. */
async function nextExternalDemoNumber() {
  const users = await db.user.findMany({ where: externalEmailFilter(), select: { email: true } });
  return nextExternalNumber(users.map((u) => u.email));
}

/**
 * Cria o condomínio de demonstração com o síndico escolhido pelo e-mail e, opcionalmente, contas reais para zelador,
 * porteiro, conselho, morador e prestador (no lugar das fictícias). E-mail sem cadastro vira uma conta de teste com a
 * senha padrão (DEMO_PASSWORD). Os e-mails ficam salvos para a próxima vez.
 * Modo externo: ignora os e-mails digitados e usa a próxima série numerada (sindicoN@, zeladorN@…), contas novas.
 */
export async function createDemoCondo(_prev: DemoState, form: FormData): Promise<DemoState> {
  const me = await requireUser("superadmin");
  const external = form.get("mode") === "external";
  const values = Object.fromEntries([...DEMO_SLOTS.map((s) => s.key), ...TRIAL_FIELDS].map((k) => [k, String(form.get(k) ?? "")]));
  const mode = external ? "external" : "internal";
  const read = external ? readTrial(form) : null;
  if (read && "error" in read) return { error: read.error, values, mode };
  const trial = read;
  const { accounts, error } = normalizeDemoAccounts(external ? externalDemoAccounts(await nextExternalDemoNumber()) : values);
  if (error) return { error, values, mode };

  // Cada e-mail precisa ser de uma conta ativa que não seja superadmin
  const found = await db.user.findMany({ where: { email: { in: Object.values(accounts) } }, select: { email: true, role: true, status: true } });
  for (const s of DEMO_SLOTS) {
    const email = accounts[s.key];
    if (!email) continue;
    const u = found.find((x) => x.email === email);
    if (!u) continue; // conta de teste nova: criada na geração com a senha padrão
    if (u.role === "superadmin") return { error: `${s.label}: o superadmin já vê todos os condomínios; escolha outro usuário.`, values, mode };
    if (u.status !== "active") return { error: `${s.label}: a conta ${email} está desativada.`, values, mode };
  }

  // Só a demonstração interna lembra os e-mails; a externa sempre usa a próxima série
  if (!external) await db.setting.upsert({
    where: { key: DEMO_ACCOUNTS_KEY },
    create: { key: DEMO_ACCOUNTS_KEY, value: JSON.stringify(accounts), updatedById: me.id },
    update: { value: JSON.stringify(accounts), updatedById: me.id },
  });
  const { syndic, ...real } = accounts;
  const condo = await createDemoCondominium({ syndicEmail: syndic!, real });
  // Externa: as contas de teste entram só até o fim do prazo; os superadmins são avisados quando acaba
  const expiresAt = trial?.days ? trialEnd(trial.days, Date.now()) : null;
  if (trial?.days) await db.condominium.update({ where: { id: condo.id }, data: { demoExpiresAt: expiresAt, ...trial.contact } });
  // Criada a partir de um pedido do site (Interessados): o pedido passa para "demonstração criada"
  const requestId = external ? String(form.get("requestId") ?? "") : "";
  if (requestId) await db.demoRequest.updateMany({ where: { id: requestId }, data: { status: "demo", condominiumId: condo.id } });
  // E-mail com as contas e o prazo para quem vai testar (marcado na janela e com e-mail do contato)
  const invite = trial?.contact.demoContactEmail && form.get("sendInvite") === "1" ? await sendDemoInvite(condo.id) : null;
  await audit(me, "create", "condominium", condo.id, { new: { name: condo.name, demo: true, tipo: external ? "externa" : "interna", contas: accounts, ...(trial?.days && { prazoDias: trial.days, fim: expiresAt, ...trial.contact }), ...(invite && { convite: invite.ok ? `enviado para ${invite.to}` : invite.error }) }, condominiumId: condo.id });
  revalidatePath("/admin/condominios");
  if (requestId) revalidatePath("/admin/interessados");
  redirect(`/admin/condominios/${condo.id}${invite ? (invite.ok ? "?convite=enviado" : `?convite=${encodeURIComponent(invite.error)}`) : ""}`);
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

export type TrialState = { error?: string; message?: string } | null;

/**
 * Prazo e contato de uma demonstração: "extend" soma dias (a partir do fim atual, ou de agora se já venceu),
 * "save" só guarda o contato, "end" encerra o teste agora. Prorrogar libera as contas de novo e zera o aviso.
 */
export async function updateDemoTrial(id: string, _prev: TrialState, form: FormData): Promise<TrialState> {
  const me = await requireUser("superadmin");
  if (me.impersonator) return { error: "Indisponível em modo de visualização." };
  const c = await db.condominium.findUnique({ where: { id }, select: { demo: true, deletedAt: true, demoExpiresAt: true, demoContactName: true, demoContactEmail: true, demoContactPhone: true } });
  if (!c?.demo || c.deletedAt) return { error: "Demonstração não encontrada." };
  const intent = String(form.get("intent") ?? "save");
  const trial = readTrial(form);
  if ("error" in trial) return { error: trial.error };
  const now = Date.now();
  if (intent === "invite") {
    await db.condominium.update({ where: { id }, data: trial.contact });
    const r = await sendDemoInvite(id);
    await audit(me, "demo_invite", "condominium", id, { new: { para: trial.contact.demoContactEmail, resultado: r.ok ? "enviado" : r.error }, condominiumId: id });
    revalidatePath(`/admin/condominios/${id}`);
    return r.ok ? { message: `Acesso enviado para ${r.to}.` } : { error: r.error };
  }
  const data =
    intent === "extend" ? { ...trial.contact, demoExpiresAt: trialEnd(trial.days, now, c.demoExpiresAt), demoExpiredNotifiedAt: null }
    : intent === "end" ? { ...trial.contact, demoExpiresAt: new Date(now), demoExpiredNotifiedAt: new Date(now) }
    : trial.contact;
  await db.condominium.update({ where: { id }, data });
  await audit(me, "demo_trial", "condominium", id, { old: { fim: c.demoExpiresAt, nome: c.demoContactName, email: c.demoContactEmail, telefone: c.demoContactPhone }, new: { acao: intent, fim: "demoExpiresAt" in data ? data.demoExpiresAt : c.demoExpiresAt, ...trial.contact }, condominiumId: id });
  revalidatePath(`/admin/condominios/${id}`);
  revalidatePath("/admin/condominios");
  return { message: intent === "extend" ? `Prorrogado por ${trial.days} dia(s).` : intent === "end" ? "Teste encerrado: as contas de teste não entram mais." : "Contato salvo." };
}
