import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { nowMs } from "@/lib/format";
import { spNow } from "@/lib/checklist";
import { financeAccess, financeCondo } from "@/lib/finance-server";
import { FIN_CATEGORIES } from "@/lib/finance";
import { realizedByCategory } from "@/lib/budget";
import { saveBudget } from "@/app/actions/budget";
import { Card, PageHeader } from "@/components/ui";
import { BudgetEditor } from "./budget-editor";

export const metadata: Metadata = { title: "Montar orçamento" };

export default async function EditBudgetPage({ searchParams }: PageProps<"/financeiro/orcamento/editar">) {
  const user = await requireUser("superadmin", "syndic");
  const sp = await searchParams;
  const condo = await financeCondo(user, sp.condo);
  if (!condo) redirect("/financeiro");
  if (!financeAccess(user, condo).edit) redirect("/financeiro/orcamento");

  const thisYear = Number(spNow(nowMs()).date.slice(0, 4));
  const year = typeof sp.ano === "string" && /^\d{4}$/.test(sp.ano) ? Number(sp.ano) : thisYear;
  const [current, previous, prevRealized, used] = await Promise.all([
    db.financeBudget.findMany({ where: { condominiumId: condo.id, year }, orderBy: { category: "asc" } }),
    db.financeBudget.findMany({ where: { condominiumId: condo.id, year: year - 1 } }),
    realizedByCategory(condo.id, year - 1),
    db.financeEntry.findMany({ where: { condominiumId: condo.id, deletedAt: null }, distinct: ["category"], select: { type: true, category: true } }),
  ]);
  const pick = (l: { type: string; category: string; amountCents?: number; realized?: number }[]) =>
    l.map((x) => ({ type: x.type as "income" | "expense", category: x.category, cents: x.amountCents ?? x.realized ?? 0 }));
  const suggestions = {
    income: [...new Set([...FIN_CATEGORIES.income, ...used.filter((u) => u.type === "income").map((u) => u.category)])],
    expense: [...new Set([...FIN_CATEGORIES.expense, ...used.filter((u) => u.type === "expense").map((u) => u.category)])],
  };
  const backQS = new URLSearchParams({ ...(user.role === "superadmin" && { condo: condo.id }), ano: String(year) }).toString();

  return (
    <div className="mx-auto max-w-4xl animate-in">
      <Link href={`/financeiro/orcamento?${backQS}`} className="mb-6 inline-flex items-center gap-2 text-xs font-medium text-muted hover:text-brand"><ArrowLeft className="size-3.5" /> Orçamento</Link>
      <PageHeader eyebrow={condo.name} title={`Orçamento ${year}`} description="Valor do ano por categoria. Deixe em branco o que não quiser orçar." />
      <Card className="p-5 sm:p-6">
        <BudgetEditor
          action={saveBudget.bind(null, condo.id, year)}
          year={year}
          initial={pick(current)}
          previousBudget={pick(previous)}
          previousRealized={pick(prevRealized)}
          suggestions={suggestions}
        />
      </Card>
    </div>
  );
}
