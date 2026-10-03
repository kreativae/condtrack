import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, PiggyBank, Pencil } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { nowMs } from "@/lib/format";
import { spNow } from "@/lib/checklist";
import { financeAccess, financeCondo } from "@/lib/finance-server";
import { fmtBRL, fmtDayBR, type FinType } from "@/lib/finance";
import { budgetReport, elapsedMonths, type BudgetRow } from "@/lib/budget";
import { Card, CardHeader, Empty, LinkButton, PageHeader, Stat, buttonClass, cx } from "@/components/ui";

export const metadata: Metadata = { title: "Orçamento" };

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);

export default async function BudgetPage({ searchParams }: PageProps<"/financeiro/orcamento">) {
  const user = await requireUser("superadmin", "syndic", "council");
  const sp = await searchParams;
  const condo = await financeCondo(user, sp.condo);
  if (!condo) redirect("/financeiro");
  const access = financeAccess(user, condo);
  if (!access.view) redirect("/dashboard");

  const today = spNow(nowMs()).date;
  const thisYear = Number(today.slice(0, 4));
  const year = typeof sp.ano === "string" && /^\d{4}$/.test(sp.ano) ? Number(sp.ano) : thisYear;
  const months = elapsedMonths(year, today);
  const r = await budgetReport(condo.id, year);

  const qs = (over: Record<string, string>) => `?${new URLSearchParams({ ...(user.role === "superadmin" && { condo: condo.id }), ano: String(year), ...over })}`;
  const back = `/financeiro${user.role === "superadmin" ? `?condo=${condo.id}` : ""}`;
  const toDate = months === 12 ? "no ano" : months === 0 ? "ainda não começou" : `até ${MONTHS[months - 1]}`;
  const resultBudget = r.totals.income.budget - r.totals.expense.budget;
  const resultReal = r.totals.income.realized - r.totals.expense.realized;

  return (
    <div className="animate-in space-y-6">
      <Link href={back} className="inline-flex items-center gap-2 text-xs font-medium text-muted hover:text-brand"><ArrowLeft className="size-3.5" /> Financeiro</Link>
      <PageHeader
        eyebrow={condo.name}
        title={`Orçamento ${year}`}
        description="Previsto × realizado por categoria. O realizado soma os lançamentos do ano (pagos e pendentes), sem os cancelados."
        actions={access.edit && <LinkButton href={`/financeiro/orcamento/editar${qs({})}`}><Pencil className="size-4" />{r.hasBudget ? "Editar orçamento" : "Montar orçamento"}</LinkButton>}
      />

      <div className="flex items-center gap-2">
        <Link href={qs({ ano: String(year - 1) })} className={buttonClass("outline", "sm")} aria-label="Ano anterior"><ChevronLeft className="size-4" /></Link>
        <p className="min-w-20 text-center font-display text-lg font-semibold">{year}</p>
        <Link href={qs({ ano: String(year + 1) })} className={buttonClass("outline", "sm")} aria-label="Próximo ano"><ChevronRight className="size-4" /></Link>
        {year !== thisYear && <Link href={qs({ ano: String(thisYear) })} className={cx(buttonClass("ghost", "sm"), "ml-1")}>Ano atual</Link>}
      </div>

      {!r.hasBudget && !r.income.length && !r.expense.length ? (
        <Card>
          <Empty icon={<PiggyBank className="size-8" />} title={`Sem orçamento para ${year}`}>
            {access.edit ? "Monte o orçamento por categoria; dá para começar pelo do ano anterior ou pelo que foi realizado nele." : "O síndico ainda não cadastrou o orçamento deste ano."}
          </Empty>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Receitas realizadas" value={fmtBRL(r.totals.income.realized)} hint={r.totals.income.budget ? `de ${fmtBRL(r.totals.income.budget)} orçados` : "sem orçamento"} tone="ok" />
            <Stat label="Despesas realizadas" value={fmtBRL(r.totals.expense.realized)} hint={r.totals.expense.budget ? `de ${fmtBRL(r.totals.expense.budget)} orçados` : "sem orçamento"} tone="bad" />
            <Stat label="Resultado realizado" value={fmtBRL(resultReal)} hint={`orçado: ${fmtBRL(resultBudget)}`} tone={resultReal < 0 ? "bad" : "ok"} />
            <Stat label="Ano corrido" value={`${Math.round((months / 12) * 100)}%`} hint={toDate} />
          </div>
          {!r.hasBudget && access.edit && (
            <p className="rounded-2xl bg-warn/10 px-4 py-3 text-sm text-fg-2 ring-1 ring-inset ring-warn/15">
              Ainda não há orçamento para {year}: abaixo só aparece o realizado. <Link href={`/financeiro/orcamento/editar${qs({})}`} className="font-medium text-brand hover:underline">Montar orçamento →</Link>
            </p>
          )}
          {(["expense", "income"] as FinType[]).map((t) => (
            <BudgetTable key={t} type={t} rows={t === "income" ? r.income : r.expense} months={months} toDate={toDate} />
          ))}
          {r.updatedAt && <p className="text-xs text-muted">Orçamento atualizado em {fmtDayBR(r.updatedAt)}. Alterações ficam no histórico do Financeiro.</p>}
        </>
      )}
    </div>
  );
}

/** Tabela de uma natureza. Despesa acima do previsto é ruim; receita abaixo do previsto é ruim. */
function BudgetTable({ type, rows, months, toDate }: { type: FinType; rows: BudgetRow[]; months: number; toDate: string }) {
  const income = type === "income";
  if (!rows.length) return null;
  const sum = (f: "budget" | "realized") => rows.reduce((s, x) => s + x[f], 0);
  const all = { category: "Total", budget: sum("budget"), realized: sum("realized") };
  return (
    <Card className="overflow-hidden">
      <CardHeader title={income ? "Receitas" : "Despesas"} subtitle={`Previsto ${toDate}: orçamento do ano proporcional aos meses.`} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="px-5 py-2.5 font-medium">Categoria</th>
              <th className="px-3 py-2.5 text-right font-medium">Orçado no ano</th>
              <th className="px-3 py-2.5 text-right font-medium">Previsto {toDate}</th>
              <th className="px-3 py-2.5 text-right font-medium">Realizado</th>
              <th className="w-48 px-5 py-2.5 font-medium">Uso do orçamento do ano</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {[...rows, all].map((x) => {
              const total = x === all;
              const expected = Math.round((x.budget * months) / 12);
              const diff = x.realized - expected;
              // Acima do previsto: ruim na despesa, bom na receita
              const bad = x.budget > 0 && (income ? diff < -expected * 0.05 : diff > expected * 0.05);
              const used = pct(x.realized, x.budget);
              const tone = used == null ? "bg-muted/40" : income ? (bad ? "bg-warn" : "bg-ok") : used > 100 ? "bg-bad" : bad ? "bg-warn" : "bg-ok";
              return (
                <tr key={x.category} className={cx(total && "bg-bg-2 font-semibold")}>
                  <td className="px-5 py-3">{x.category}</td>
                  <td className="px-3 py-3 text-right font-num">{x.budget ? fmtBRL(x.budget) : <span className="text-muted">—</span>}</td>
                  <td className="px-3 py-3 text-right font-num">{x.budget ? fmtBRL(expected) : <span className="text-muted">—</span>}</td>
                  <td className={cx("px-3 py-3 text-right font-num", bad && (income ? "text-warn" : "text-bad"))}>
                    {fmtBRL(x.realized)}
                    {x.budget > 0 && months > 0 && (
                      <span className="block text-xs font-normal text-muted">{diff === 0 ? "no previsto" : `${diff > 0 ? "+" : "−"}${fmtBRL(Math.abs(diff))} ${diff > 0 ? "acima" : "abaixo"}`}</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    {used == null ? (
                      <span className="text-xs text-muted">{x.realized ? "sem orçamento" : "—"}</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-bg-2">
                          <div className={cx("h-full rounded-full", tone)} style={{ width: `${Math.min(100, used)}%` }} />
                        </div>
                        <span className="w-11 text-right font-num text-xs">{used}%</span>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
