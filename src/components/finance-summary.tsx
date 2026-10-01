import Link from "next/link";
import { ArrowRight, Wallet } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { nowMs } from "@/lib/format";
import { financePeriod } from "@/lib/finance-server";
import { fmtBRL, fmtDayBR } from "@/lib/finance";
import { Badge, Card, cx } from "@/components/ui";

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/**
 * Resumo do Financeiro no painel: o mês atual e as contas a vencer.
 * condominiumId ausente = todos os condomínios (superadmin).
 */
export async function FinanceSummary({ condominiumId, className }: { condominiumId?: string; className?: string }) {
  const p = financePeriod({});
  const now = new Date(nowMs());
  const scope: Prisma.FinanceEntryWhereInput = { deletedAt: null, ...(condominiumId && { condominiumId }) };
  const month = { ...scope, date: { gte: p.from, lt: p.to } };

  const [totals, overdue, upcoming] = await Promise.all([
    db.financeEntry.groupBy({ by: ["type", "status"], where: month, _sum: { amountCents: true } }),
    db.financeEntry.aggregate({ where: { ...scope, type: "expense", status: "pending", dueDate: { lt: now } }, _sum: { amountCents: true }, _count: true }),
    db.financeEntry.findMany({
      where: { ...scope, type: "expense", status: "pending", dueDate: { not: null } },
      orderBy: { dueDate: "asc" },
      take: 5,
      select: { id: true, description: true, amountCents: true, dueDate: true, condominium: { select: { name: true } } },
    }),
  ]);
  const sum = (type: string, status: string) => totals.find((t) => t.type === type && t.status === status)?._sum.amountCents ?? 0;
  const income = sum("income", "paid");
  const expense = sum("expense", "paid");
  const toPay = sum("expense", "pending");
  const toReceive = sum("income", "pending");
  const label = `${MONTHS[Number(p.key.slice(5)) - 1]} de ${p.key.slice(0, 4)}`;

  return (
    <Card className={cx("mb-8 overflow-hidden", className)}>
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-xl bg-brand-soft text-brand"><Wallet className="size-[18px]" /></span>
          <div>
            <p className="font-display font-semibold">Financeiro</p>
            <p className="text-xs text-muted first-letter:uppercase">{label}{!condominiumId && " · todos os condomínios"}</p>
          </div>
        </div>
        <Link href="/financeiro" className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">Abrir <ArrowRight className="size-3.5" /></Link>
      </div>

      <div className="grid grid-cols-2 divide-line sm:grid-cols-4 sm:divide-x">
        <Mini label="Receitas recebidas" value={fmtBRL(income)} tone="text-ok" />
        <Mini label="Despesas pagas" value={fmtBRL(expense)} tone="text-bad" />
        <Mini label="Saldo do mês" value={fmtBRL(income - expense)} tone={income - expense < 0 ? "text-bad" : "text-fg"} />
        <Mini label="A receber · a pagar" value={`${fmtBRL(toReceive)} · ${fmtBRL(toPay)}`} small />
      </div>

      <div className="border-t border-line">
        <div className="flex items-center justify-between px-5 pb-1 pt-3">
          <p className="text-xs font-medium text-muted">Próximos vencimentos</p>
          {overdue._count > 0 && <Badge tone="bad" dot>{overdue._count} vencido(s) · {fmtBRL(overdue._sum.amountCents ?? 0)}</Badge>}
        </div>
        {upcoming.length ? (
          <ul className="divide-y divide-line">
            {upcoming.map((e) => {
              const late = e.dueDate! < now;
              return (
                <li key={e.id}>
                  <Link href={`/financeiro/${e.id}`} className="flex items-center gap-3 px-5 py-2.5 text-sm hover:bg-bg-2/60">
                    <span className={cx("w-20 shrink-0 text-xs tabular-nums", late ? "font-semibold text-bad" : "text-muted")}>{fmtDayBR(e.dueDate)}</span>
                    <span className="min-w-0 flex-1 truncate">
                      {e.description}
                      {!condominiumId && <span className="text-muted"> · {e.condominium.name}</span>}
                    </span>
                    <span className="shrink-0 font-num font-semibold tabular-nums">{fmtBRL(e.amountCents)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-5 pb-4 pt-1 text-sm text-muted">Nenhuma conta a pagar com vencimento.</p>
        )}
      </div>
    </Card>
  );
}

function Mini({ label, value, tone, small }: { label: string; value: string; tone?: string; small?: boolean }) {
  return (
    <div className="px-5 py-4">
      <p className="text-[11px] font-medium text-muted">{label}</p>
      <p className={cx("mt-1 font-num font-bold tabular-nums", small ? "text-sm" : "text-lg", tone)}>{value}</p>
    </div>
  );
}
