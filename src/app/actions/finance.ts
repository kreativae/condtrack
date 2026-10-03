"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, type CurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { financeAccess, financeLog, loadEntryFor } from "@/lib/finance-server";
import { DAY_RE, FIN_STATUS, FIN_TYPES, dateToDay, dayToDate, fmtBRL, parseBRL } from "@/lib/finance";

export type FinanceState = { error?: string; ok?: boolean; message?: string } | undefined;

const fail = (e: unknown): FinanceState => ({ error: e instanceof z.ZodError ? e.issues[0].message : e instanceof Error ? e.message : "Erro inesperado." });

const opt = (max: number) => z.string().trim().max(max).optional().transform((v) => v || null);
const day = (msg: string) => z.string().regex(DAY_RE, msg);
const optDay = z.string().optional().transform((v) => (v && DAY_RE.test(v) ? v : null));

const entrySchema = z.object({
  type: z.enum(Object.keys(FIN_TYPES) as [keyof typeof FIN_TYPES, ...(keyof typeof FIN_TYPES)[]], { message: "Escolha receita ou despesa." }),
  category: z.string().trim().min(2, "Informe a categoria.").max(60),
  description: z.string().trim().min(2, "Informe a descrição.").max(200),
  counterparty: opt(120),
  document: opt(60),
  amount: z.string(),
  date: day("Informe a data de competência."),
  dueDate: optDay,
  paidAt: optDay,
  status: z.enum(Object.keys(FIN_STATUS) as [keyof typeof FIN_STATUS, ...(keyof typeof FIN_STATUS)[]]),
  paymentMethod: opt(40),
  notes: opt(2000),
});

/** Formulário → dados do banco (valida valor e datas). */
function parseEntry(form: FormData) {
  const v = entrySchema.parse(Object.fromEntries(form));
  const amountCents = parseBRL(v.amount);
  if (amountCents == null || amountCents <= 0) throw new Error("Informe um valor maior que zero (ex.: 1.250,00).");
  if (amountCents > 100_000_000_00) throw new Error("Valor muito alto.");
  if (v.status === "paid" && !v.paidAt) throw new Error("Informe a data do pagamento.");
  return {
    type: v.type,
    category: v.category,
    description: v.description,
    counterparty: v.counterparty,
    document: v.document,
    amountCents,
    date: dayToDate(v.date),
    dueDate: v.dueDate ? dayToDate(v.dueDate) : null,
    paidAt: v.status === "paid" && v.paidAt ? dayToDate(v.paidAt) : null,
    status: v.status,
    paymentMethod: v.paymentMethod,
    notes: v.notes,
  };
}

type EntryData = ReturnType<typeof parseEntry>;

/** Valor legível de um campo, para o histórico. */
function show(k: string, v: unknown) {
  if (v == null || v === "") return "—";
  if (k === "amountCents") return fmtBRL(Number(v));
  if (k === "type") return FIN_TYPES[v as keyof typeof FIN_TYPES] ?? String(v);
  if (k === "status") return FIN_STATUS[v as keyof typeof FIN_STATUS]?.label ?? String(v);
  if (v instanceof Date) return dateToDay(v).split("-").reverse().join("/");
  return String(v);
}

function diff(old: Record<string, unknown>, next: EntryData) {
  const out: Record<string, [string, string]> = {};
  for (const [k, v] of Object.entries(next)) {
    const a = show(k, old[k]);
    const b = show(k, v);
    if (a !== b) out[k] = [a, b];
  }
  return out;
}

function refresh(id?: string) {
  revalidatePath("/financeiro");
  if (id) revalidatePath(`/financeiro/${id}`);
}

/** Condomínio em que o usuário pode lançar (síndico: o próprio; superadmin: o escolhido). */
async function editableCondo(user: CurrentUser, condoId: string) {
  const condo = await db.condominium.findUnique({ where: { id: condoId }, select: { id: true, councilFinanceAccess: true } });
  if (!condo || !financeAccess(user, condo).edit) throw new Error("Sem permissão para lançar neste condomínio.");
  return condo;
}

async function editableEntry(user: CurrentUser, id: string) {
  const r = await loadEntryFor(user, id);
  if (!r || !r.access.edit) throw new Error("Sem permissão para alterar este lançamento.");
  return r.entry;
}

export async function createFinanceEntry(_prev: FinanceState, form: FormData): Promise<FinanceState> {
  const user = await requireUser("superadmin", "syndic");
  let id = "";
  try {
    const condo = await editableCondo(user, user.role === "superadmin" ? String(form.get("condominiumId") ?? "") : user.condominiumId ?? "");
    const data = parseEntry(form);
    const entry = await db.financeEntry.create({ data: { ...data, condominiumId: condo.id, createdById: user.id, updatedById: user.id } });
    id = entry.id;
    await financeLog(user, { condominiumId: condo.id, entryId: id, action: "created", changes: { valor: fmtBRL(data.amountCents), tipo: FIN_TYPES[data.type] } });
  } catch (e) {
    return fail(e);
  }
  refresh();
  redirect(`/financeiro/${id}`);
}

export async function updateFinanceEntry(_prev: FinanceState, form: FormData): Promise<FinanceState> {
  const user = await requireUser("superadmin", "syndic");
  const id = String(form.get("id") ?? "");
  try {
    const entry = await editableEntry(user, id);
    if (entry.deletedAt) throw new Error("Restaure o lançamento antes de editar.");
    const data = parseEntry(form);
    const changes = diff(entry as unknown as Record<string, unknown>, data);
    if (!Object.keys(changes).length) return { ok: true, message: "Nada foi alterado." };
    await db.financeEntry.update({ where: { id }, data: { ...data, updatedById: user.id } });
    await financeLog(user, { condominiumId: entry.condominiumId, entryId: id, action: "updated", changes });
  } catch (e) {
    return fail(e);
  }
  refresh(id);
  return { ok: true, message: "Lançamento atualizado." };
}

/** Atalho: marcar como pago (hoje) ou voltar para pendente. */
export async function setFinanceStatus(form: FormData) {
  const user = await requireUser("superadmin", "syndic");
  const id = String(form.get("id") ?? "");
  const status = form.get("status") === "paid" ? "paid" : "pending";
  const entry = await editableEntry(user, id);
  if (entry.deletedAt || entry.status === status) return;
  const paidAt = status === "paid" ? dayToDate(dateToDay(new Date())) : null;
  await db.financeEntry.update({ where: { id }, data: { status, paidAt, updatedById: user.id } });
  await financeLog(user, {
    condominiumId: entry.condominiumId,
    entryId: id,
    action: "updated",
    changes: { status: [show("status", entry.status), show("status", status)], paidAt: [show("paidAt", entry.paidAt), show("paidAt", paidAt)] },
  });
  refresh(id);
}

export async function deleteFinanceEntry(form: FormData) {
  const user = await requireUser("superadmin", "syndic");
  const id = String(form.get("id") ?? "");
  const entry = await editableEntry(user, id);
  if (entry.deletedAt) return;
  await db.financeEntry.update({ where: { id }, data: { deletedAt: new Date(), updatedById: user.id } });
  await financeLog(user, { condominiumId: entry.condominiumId, entryId: id, action: "deleted", changes: { descricao: entry.description, valor: fmtBRL(entry.amountCents) } });
  await audit(user, "finance_entry_deleted", "finance_entry", id, { old: { description: entry.description, amountCents: entry.amountCents }, condominiumId: entry.condominiumId });
  refresh(id);
}

export async function restoreFinanceEntry(form: FormData) {
  const user = await requireUser("superadmin", "syndic");
  const id = String(form.get("id") ?? "");
  const entry = await editableEntry(user, id);
  if (!entry.deletedAt) return;
  await db.financeEntry.update({ where: { id }, data: { deletedAt: null, updatedById: user.id } });
  await financeLog(user, { condominiumId: entry.condominiumId, entryId: id, action: "restored" });
  refresh(id);
}

/** Tira o anexo da lista; o arquivo fica guardado para o histórico. */
export async function removeFinanceAttachment(form: FormData) {
  const user = await requireUser("superadmin", "syndic");
  const att = await db.financeAttachment.findUnique({ where: { id: String(form.get("attachmentId") ?? "") } });
  if (!att || att.deletedAt) return;
  const entry = await editableEntry(user, att.entryId);
  await db.financeAttachment.update({ where: { id: att.id }, data: { deletedAt: new Date() } });
  await financeLog(user, { condominiumId: entry.condominiumId, entryId: entry.id, attachmentId: att.id, action: "attachment_removed", changes: { arquivo: att.fileName } });
  refresh(entry.id);
}

/** Síndico ou superadmin libera (ou retira) o acesso do conselho às finanças. */
export async function setCouncilFinanceAccess(form: FormData) {
  const user = await requireUser("superadmin", "syndic");
  const condoId = user.role === "superadmin" ? String(form.get("condominiumId") ?? "") : user.condominiumId ?? "";
  const condo = await db.condominium.findUnique({ where: { id: condoId }, select: { id: true, councilFinanceAccess: true } });
  if (!condo || !financeAccess(user, condo).manageAccess) throw new Error("Sem permissão.");
  const enabled = form.get("enabled") === "1";
  if (condo.councilFinanceAccess === enabled) return;
  await db.condominium.update({ where: { id: condo.id }, data: { councilFinanceAccess: enabled } });
  await financeLog(user, { condominiumId: condo.id, action: "council_access", changes: { acesso: enabled ? "liberado" : "retirado" } });
  await audit(user, "council_finance_access", "condominium", condo.id, { old: { councilFinanceAccess: condo.councilFinanceAccess }, new: { councilFinanceAccess: enabled }, condominiumId: condo.id });
  // O menu do conselho depende desse acesso
  revalidatePath("/", "layout");
}
