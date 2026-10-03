"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { financeAccess, financeLog } from "@/lib/finance-server";
import { FIN_TYPES, fmtBRL, parseBRL } from "@/lib/finance";

export type BudgetState = { error?: string } | undefined;

/** Grava o orçamento do ano (lista completa: linhas sem valor saem). Fica no histórico do Financeiro. */
export async function saveBudget(condominiumId: string, year: number, _: BudgetState, form: FormData): Promise<BudgetState> {
  const user = await requireUser("superadmin", "syndic");
  const condo = await db.condominium.findUnique({ where: { id: condominiumId }, select: { id: true, councilFinanceAccess: true } });
  if (!condo || !financeAccess(user, condo).edit) return { error: "Sem permissão." };
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return { error: "Ano inválido." };

  const types = form.getAll("type").map(String);
  const cats = form.getAll("category").map((c) => String(c).trim());
  const amounts = form.getAll("amount").map(String);
  const rows = new Map<string, { type: string; category: string; amountCents: number }>();
  for (let i = 0; i < types.length; i++) {
    const type = types[i], category = cats[i] ?? "", raw = (amounts[i] ?? "").trim();
    if (!(type in FIN_TYPES) || !category || !raw) continue;
    if (category.length > 60) return { error: `Categoria muito longa: ${category.slice(0, 30)}…` };
    const cents = parseBRL(raw);
    if (cents == null || cents < 0) return { error: `Valor inválido em “${category}”.` };
    if (cents === 0) continue;
    rows.set(`${type}\u0000${category.toLowerCase()}`, { type, category, amountCents: cents });
  }

  const before = await db.financeBudget.findMany({ where: { condominiumId, year } });
  await db.$transaction([
    db.financeBudget.deleteMany({ where: { condominiumId, year } }),
    db.financeBudget.createMany({ data: [...rows.values()].map((r) => ({ ...r, condominiumId, year, updatedById: user.id })) }),
  ]);

  // Histórico: o que mudou, por categoria
  const label = (t: string, c: string) => `${FIN_TYPES[t as keyof typeof FIN_TYPES]} · ${c}`;
  const changes: Record<string, { de: string; para: string }> = {};
  for (const b of before) {
    const now = rows.get(`${b.type}\u0000${b.category.toLowerCase()}`);
    if (!now || now.amountCents !== b.amountCents) changes[label(b.type, b.category)] = { de: fmtBRL(b.amountCents), para: now ? fmtBRL(now.amountCents) : "—" };
  }
  for (const r of rows.values()) {
    if (!before.some((b) => b.type === r.type && b.category.toLowerCase() === r.category.toLowerCase())) changes[label(r.type, r.category)] = { de: "—", para: fmtBRL(r.amountCents) };
  }
  if (Object.keys(changes).length) await financeLog(user, { condominiumId, action: "budget_updated", changes: { ano: year, ...changes } });

  revalidatePath("/financeiro/orcamento");
  redirect(`/financeiro/orcamento?${new URLSearchParams({ ano: String(year), ...(user.role === "superadmin" && { condo: condominiumId }) })}`);
}
