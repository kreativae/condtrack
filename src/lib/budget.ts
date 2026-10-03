import "server-only";
import { db } from "./db";
import type { FinType } from "./finance";

// Orçamento anual × realizado. Realizado = lançamentos do ano (data de competência),
// pagos ou pendentes, sem os cancelados e excluídos.

export type BudgetRow = { type: FinType; category: string; budget: number; realized: number; paid: number };

/** Meses do ano já "corridos" (o mês atual conta inteiro): 12 para anos passados, 0 para futuros. */
export function elapsedMonths(year: number, today: string) {
  const [y, m] = today.split("-").map(Number);
  return year < y ? 12 : year > y ? 0 : m;
}

const yearRange = (year: number) => ({ gte: new Date(`${year}-01-01T00:00:00-03:00`), lt: new Date(`${year + 1}-01-01T00:00:00-03:00`) });

/** Realizado do ano por tipo e categoria. */
export async function realizedByCategory(condominiumId: string, year: number) {
  const where = { condominiumId, deletedAt: null, date: yearRange(year) };
  const [all, paid] = await Promise.all([
    db.financeEntry.groupBy({ by: ["type", "category"], where: { ...where, status: { not: "cancelled" } }, _sum: { amountCents: true } }),
    db.financeEntry.groupBy({ by: ["type", "category"], where: { ...where, status: "paid" }, _sum: { amountCents: true } }),
  ]);
  return all.map((r) => ({
    type: r.type as FinType,
    category: r.category,
    realized: r._sum.amountCents ?? 0,
    paid: paid.find((p) => p.type === r.type && p.category === r.category)?._sum.amountCents ?? 0,
  }));
}

/** Linhas do orçamento do ano (categorias orçadas + as que tiveram lançamento), por tipo. */
export async function budgetReport(condominiumId: string, year: number) {
  const [budget, realized] = await Promise.all([
    db.financeBudget.findMany({ where: { condominiumId, year }, orderBy: { category: "asc" } }),
    realizedByCategory(condominiumId, year),
  ]);
  const key = (t: string, c: string) => `${t}\u0000${c}`;
  const rows = new Map<string, BudgetRow>();
  for (const b of budget) rows.set(key(b.type, b.category), { type: b.type as FinType, category: b.category, budget: b.amountCents, realized: 0, paid: 0 });
  for (const r of realized) {
    const row = rows.get(key(r.type, r.category)) ?? { type: r.type, category: r.category, budget: 0, realized: 0, paid: 0 };
    rows.set(key(r.type, r.category), { ...row, realized: r.realized, paid: r.paid });
  }
  // Orçadas primeiro (maior valor no topo); depois as que só têm realizado
  const list = [...rows.values()].sort((a, b) => (b.budget ? 1 : 0) - (a.budget ? 1 : 0) || b.budget - a.budget || b.realized - a.realized);
  const total = (type: FinType, f: "budget" | "realized" | "paid") => list.filter((r) => r.type === type).reduce((s, r) => s + r[f], 0);
  return {
    hasBudget: budget.length > 0,
    updatedAt: budget.reduce<Date | null>((m, b) => (!m || b.updatedAt > m ? b.updatedAt : m), null),
    income: list.filter((r) => r.type === "income"),
    expense: list.filter((r) => r.type === "expense"),
    totals: {
      income: { budget: total("income", "budget"), realized: total("income", "realized"), paid: total("income", "paid") },
      expense: { budget: total("expense", "budget"), realized: total("expense", "realized"), paid: total("expense", "paid") },
    },
  };
}
