import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { DAY_RE, dateToDay, dayToDate } from "@/lib/finance";
import { nowMs } from "@/lib/format";
import { groupLabel, groupStats, quoteStatus } from "@/lib/suppliers";
import { supplierCondo } from "@/lib/suppliers-server";
import { Card, Empty, PageHeader, cx } from "@/components/ui";
import { ReportPicker, type PickGroup } from "./picker";

export const metadata: Metadata = { title: "Relatório de cotações" };

const SITUATIONS = { todas: "Todas", andamento: "Em andamento", encerradas: "Encerradas", arquivadas: "Histórico" } as const;
type Situation = keyof typeof SITUATIONS;

/** Síndico e superadmin escolhem cotações e orçamentos para o relatório (assembleia, prestação de contas). */
export default async function SupplierReportPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser("superadmin", "syndic");
  const condoId = await supplierCondo(user);
  if (!condoId) redirect("/fornecedores");
  const sp = await searchParams;
  const today = dateToDay(new Date(nowMs()));
  const from = sp.de && DAY_RE.test(sp.de) ? sp.de : `${today.slice(0, 4)}-01-01`;
  const to = sp.ate && DAY_RE.test(sp.ate) ? sp.ate : today;
  const situation: Situation = sp.situacao && sp.situacao in SITUATIONS ? (sp.situacao as Situation) : "todas";

  const groups = await db.quoteGroup.findMany({
    where: {
      condominiumId: condoId,
      createdAt: { gte: dayToDate(from), lt: new Date(dayToDate(to).getTime() + 86_400_000) },
      ...(situation === "andamento" && { status: "open" }),
      ...(situation === "encerradas" && { status: "closed", archivedAt: null }),
      ...(situation === "arquivadas" && { archivedAt: { not: null } }),
    },
    include: { quotes: { where: { status: { not: "cancelled" } }, include: { supplier: { select: { name: true, category: true } } }, orderBy: { amountCents: "asc" } } },
    orderBy: { createdAt: "desc" },
  });
  const pick: PickGroup[] = groups.filter((g) => g.quotes.length).map((g) => ({
    id: g.id,
    title: g.title,
    label: groupLabel(g, groupStats(g.quotes).pending).text,
    category: g.quotes[0]?.supplier.category ?? null,
    chosenQuoteId: g.chosenQuoteId,
    quotes: g.quotes.map((q) => ({ id: q.id, supplier: q.supplier.name, amountCents: q.amountCents, status: q.status, statusLabel: q.id === g.chosenQuoteId ? "contratado" : quoteStatus(q.status).short.toLowerCase() })),
  }));
  const qs = (extra: Record<string, string>) => `/fornecedores/relatorio?${new URLSearchParams({ de: from, ate: to, situacao: situation, ...extra })}`;

  return (
    <div className="animate-in">
      <Link href="/fornecedores" className="mb-6 inline-flex items-center gap-2 text-xs font-medium text-muted hover:text-brand"><ArrowLeft className="size-3.5" /> Fornecedores</Link>
      <PageHeader eyebrow="Relatório" title="Relatório de cotações" description="Escolha as cotações e os orçamentos para apresentar em assembleia ou na prestação de contas. O relatório abre pronto para salvar em PDF." />

      <form className="mb-5 flex flex-wrap items-end gap-3" action="/fornecedores/relatorio">
        <label className="text-xs text-muted">De<input type="date" name="de" defaultValue={from} className="mt-1 block h-10 rounded-xl border border-line-strong bg-surface px-3 text-sm text-fg" /></label>
        <label className="text-xs text-muted">Até<input type="date" name="ate" defaultValue={to} className="mt-1 block h-10 rounded-xl border border-line-strong bg-surface px-3 text-sm text-fg" /></label>
        <input type="hidden" name="situacao" value={situation} />
        <button className="h-10 rounded-xl px-4 text-sm font-medium ring-1 ring-line-strong hover:bg-bg-2">Aplicar</button>
        <div className="flex flex-wrap gap-1.5 sm:ml-auto">
          {(Object.keys(SITUATIONS) as Situation[]).map((k) => (
            <Link key={k} href={qs({ situacao: k })} className={cx("rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition", situation === k ? "bg-brand-soft text-brand ring-brand" : "text-fg-2 ring-line-strong hover:bg-bg-2")}>{SITUATIONS[k]}</Link>
          ))}
        </div>
      </form>

      {pick.length ? (
        <ReportPicker key={`${from}${to}${situation}`} groups={pick} />
      ) : (
        <Card><Empty title="Nenhuma cotação neste período">Mude as datas ou a situação. O período considera a data de criação da cotação.</Empty></Card>
      )}
    </div>
  );
}
