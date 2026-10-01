import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { financeAccess, financeCondo, financeLog, financePeriod } from "@/lib/finance-server";
import { FIN_STATUS, FIN_TYPES, fmtBRL, fmtDayBR, type FinStatus } from "@/lib/finance";
import { nowMs } from "@/lib/format";
import { themeVars } from "@/lib/theme-appearance";
import { getThemeAppearance } from "@/lib/theme-appearance-server";
import { Logo } from "@/components/logo";
import { buttonClass, cx } from "@/components/ui";
import { AutoPrint, PrintButton } from "../print-button";

// Demonstrativo financeiro do período em A4, salvo pelo navegador ("Salvar como PDF").
// Fora do layout do app, como o relatório de serviços.

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const periodLabel = (p: ReturnType<typeof financePeriod>) => (p.kind === "year" ? `Ano de ${p.key}` : `${MONTHS[Number(p.key.slice(5)) - 1]} de ${p.key.slice(0, 4)}`);

export async function generateMetadata({ searchParams }: PageProps<"/relatorio/financeiro">): Promise<Metadata> {
  const user = await requireUser("superadmin", "syndic", "council");
  const sp = await searchParams;
  const condo = await financeCondo(user, sp.condo);
  return { title: { absolute: `Financeiro - ${condo?.name ?? "Condtrack"} - ${financePeriod(sp).key}` } };
}

const PRINT_CSS = `
@page {
  size: A4;
  margin: 14mm 12mm 16mm;
  @bottom-center { content: "Página " counter(page) " de " counter(pages); font: 9px ui-sans-serif, system-ui, sans-serif; color: #64748b; }
}
@media print {
  html, body { background: #fff !important; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  thead { display: table-header-group; }
}`;

export default async function FinancePrintPage({ searchParams }: PageProps<"/relatorio/financeiro">) {
  const user = await requireUser("superadmin", "syndic", "council");
  const sp = await searchParams;
  const condo = await financeCondo(user, sp.condo);
  if (!condo || !financeAccess(user, condo).view) redirect("/financeiro");
  const p = financePeriod(sp);
  const now = nowMs();

  const [info, entries, theme] = await Promise.all([
    db.condominium.findUnique({ where: { id: condo.id }, select: { address: true, cnpj: true, logoUrl: true } }),
    db.financeEntry.findMany({
      where: { condominiumId: condo.id, deletedAt: null, date: { gte: p.from, lt: p.to } },
      include: { _count: { select: { attachments: { where: { deletedAt: null } } } } },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    }),
    getThemeAppearance(),
  ]);
  await financeLog(user, { condominiumId: condo.id, action: "exported", changes: { periodo: p.key, formato: "PDF", linhas: entries.length } });

  const active = entries.filter((e) => e.status !== "cancelled");
  const total = (type: string, st?: FinStatus) => active.filter((e) => e.type === type && (!st || e.status === st)).reduce((a, e) => a + e.amountCents, 0);
  const incomePaid = total("income", "paid");
  const expensePaid = total("expense", "paid");
  const byCat = (type: string) =>
    [...active.filter((e) => e.type === type).reduce((m, e) => m.set(e.category, (m.get(e.category) ?? 0) + e.amountCents), new Map<string, number>())].sort((a, b) => b[1] - a[1]);
  const incomeCats = byCat("income");
  const expenseCats = byCat("expense");
  const style = { ...themeVars(theme, "light"), colorScheme: "light" } as CSSProperties;
  const back = user.role === "superadmin" ? `/financeiro?condo=${condo.id}` : "/financeiro";

  return (
    <div style={style} className="min-h-dvh bg-bg-2 text-fg print:bg-white">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <AutoPrint />

      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-line bg-surface/95 px-4 py-3 backdrop-blur print:hidden">
        <Link href={back} className={buttonClass("ghost")}><ArrowLeft className="size-4" />Voltar</Link>
        <p className="mr-auto text-sm text-muted">Na janela de impressão, escolha “Salvar como PDF”.</p>
        <PrintButton />
      </div>

      <article className="mx-auto my-6 w-full max-w-[210mm] bg-surface p-6 shadow-pop sm:p-[14mm] print:m-0 print:max-w-none print:p-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-brand pb-5">
          <div>
            {info?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={info.logoUrl} alt="" className="mb-3 h-10 w-auto object-contain" />
            ) : (
              <div className="mb-3"><Logo size={30} /></div>
            )}
            <h1 className="font-display text-2xl font-bold leading-tight">{condo.name}</h1>
            {(info?.address || info?.cnpj) && <p className="mt-1 text-xs text-muted">{[info?.address, info?.cnpj && `CNPJ ${info.cnpj}`].filter(Boolean).join(" · ")}</p>}
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand">Demonstrativo financeiro</p>
            <p className="mt-1 font-display text-lg font-bold first-letter:uppercase">{periodLabel(p)}</p>
            <p className="mt-1 text-[11px] text-muted">Gerado em {fmtDayBR(new Date(now))} por {user.name}</p>
          </div>
        </header>

        <Section title="Resumo">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 print:grid-cols-4">
            <Num label="Receitas recebidas" value={fmtBRL(incomePaid)} tone="text-ok" />
            <Num label="Despesas pagas" value={fmtBRL(expensePaid)} tone="text-bad" />
            <Num label="Saldo do período" value={fmtBRL(incomePaid - expensePaid)} tone={incomePaid - expensePaid < 0 ? "text-bad" : undefined} />
            <Num label="Lançamentos" value={String(entries.length)} />
            <Num label="A receber" value={fmtBRL(total("income", "pending"))} />
            <Num label="A pagar" value={fmtBRL(total("expense", "pending"))} />
            <Num label="Total de receitas" value={fmtBRL(total("income"))} />
            <Num label="Total de despesas" value={fmtBRL(total("expense"))} />
          </div>
        </Section>

        {entries.length > 0 && (
          <div className="grid gap-x-6 sm:grid-cols-2 print:grid-cols-2">
            <Section title="Receitas por categoria"><CatTable rows={incomeCats} /></Section>
            <Section title="Despesas por categoria"><CatTable rows={expenseCats} /></Section>
          </div>
        )}

        <Section title={`Lançamentos (${entries.length})`}>
          {entries.length ? (
            <table className="w-full text-left text-[11px]">
              <thead className="border-b border-line-strong text-muted">
                <tr>
                  <th className="py-1.5 pr-2 font-medium">Data</th>
                  <th className="py-1.5 pr-2 font-medium">Descrição</th>
                  <th className="py-1.5 pr-2 font-medium">Categoria</th>
                  <th className="py-1.5 pr-2 font-medium">Situação</th>
                  <th className="py-1.5 text-right font-medium">Valor</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => {
                  const late = e.status === "pending" && e.dueDate && e.dueDate.getTime() < now;
                  return (
                    <tr key={e.id} className="break-inside-avoid border-b border-line align-top">
                      <td className="whitespace-nowrap py-1.5 pr-2 text-fg-2">{fmtDayBR(e.date)}</td>
                      <td className="py-1.5 pr-2">
                        <span className="font-medium">{e.description}</span>
                        <span className="block text-muted">{[e.counterparty, e.document && `Doc. ${e.document}`, e._count.attachments > 0 && `${e._count.attachments} anexo(s)`].filter(Boolean).join(" · ")}</span>
                      </td>
                      <td className="py-1.5 pr-2 text-fg-2">{e.category}</td>
                      <td className={cx("whitespace-nowrap py-1.5 pr-2", late && "font-semibold text-bad")}>
                        {late ? "Vencido" : FIN_STATUS[e.status as FinStatus]?.label ?? e.status}
                        {e.paidAt && <span className="block text-muted">{fmtDayBR(e.paidAt)}</span>}
                      </td>
                      <td className={cx("whitespace-nowrap py-1.5 text-right font-semibold tabular-nums", e.type === "income" ? "text-ok" : "text-fg", e.status === "cancelled" && "text-muted line-through")}>
                        {e.type === "income" ? "+" : "−"} {fmtBRL(e.amountCents)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="rounded-xl bg-bg-2 px-4 py-6 text-center text-sm text-muted">Nenhum lançamento neste período.</p>
          )}
        </Section>

        <footer className="mt-8 border-t border-line pt-3 text-[10px] text-muted">
          {FIN_TYPES.income}s e {FIN_TYPES.expense.toLowerCase()}s pela data de competência. Cancelados aparecem riscados e não entram nos totais. As notas fiscais e o histórico de cada lançamento estão no Condtrack.
        </footer>
      </article>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="mb-3 break-after-avoid font-display text-[15px] font-bold">{title}</h2>
      {children}
    </section>
  );
}

function Num({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="break-inside-avoid rounded-xl border border-line bg-surface-2 px-3 py-2.5">
      <p className="text-[10px] leading-tight text-muted">{label}</p>
      <p className={cx("mt-1 font-display text-base font-bold tabular-nums", tone)}>{value}</p>
    </div>
  );
}

function CatTable({ rows }: { rows: [string, number][] }) {
  if (!rows.length) return <p className="text-xs text-muted">Nenhum lançamento.</p>;
  const sum = rows.reduce((a, [, v]) => a + v, 0);
  return (
    <table className="w-full text-left text-xs">
      <tbody>
        {rows.map(([name, v]) => (
          <tr key={name} className="border-b border-line">
            <td className="py-1.5 pr-2">{name}</td>
            <td className="py-1.5 pr-2 text-right text-muted tabular-nums">{Math.round((v / sum) * 100)}%</td>
            <td className="py-1.5 text-right font-semibold tabular-nums">{fmtBRL(v)}</td>
          </tr>
        ))}
        <tr><td className="pt-2 font-semibold">Total</td><td /><td className="pt-2 text-right font-bold tabular-nums">{fmtBRL(sum)}</td></tr>
      </tbody>
    </table>
  );
}
