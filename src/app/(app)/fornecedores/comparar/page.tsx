import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, MessageCircle, Plus, Trophy } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { dateToDay, fmtBRL } from "@/lib/finance";
import { fmtRelative, nowMs } from "@/lib/format";
import { SUPPLIER_ROLES, canDecideQuote, priceDiff, quoteKey, quoteStatus, validityLabel, whatsappNumber } from "@/lib/suppliers";
import { supplierCondo } from "@/lib/suppliers-server";
import { Badge, LinkButton, PageHeader, cx } from "@/components/ui";
import { CategoryIcon } from "@/components/suppliers/look";
import { Stars } from "../stars";
import { ChooseButton } from "./choose";

export const metadata: Metadata = { title: "Comparar orçamentos" };

/** Orçamentos do mesmo serviço lado a lado: valor, prazo, pagamento, validade, avaliação e arquivos. */
export default async function ComparePage({ searchParams }: { searchParams: Promise<{ servico?: string }> }) {
  const user = await requireUser(...SUPPLIER_ROLES);
  const { servico = "" } = await searchParams;
  const condoId = await supplierCondo(user);
  const key = quoteKey(servico);
  if (!condoId || !key) notFound();

  const quotes = (await db.supplierQuote.findMany({
    where: { condominiumId: condoId, status: { in: ["pending", "approved", "rejected"] } },
    include: { supplier: true, files: { select: { id: true, fileName: true }, orderBy: { createdAt: "asc" } } },
    orderBy: { amountCents: "asc" },
  })).filter((q) => quoteKey(q.title) === key);
  if (!quotes.length) notFound();

  const today = dateToDay(new Date(nowMs()));
  const live = quotes.filter((q) => q.status !== "rejected");
  const min = Math.min(...live.map((q) => q.amountCents));
  const spread = Math.max(...live.map((q) => q.amountCents)) - min;
  const pendingIds = quotes.filter((q) => q.status === "pending").map((q) => q.id);
  const decider = canDecideQuote(user.role);
  const title = quotes[0].title;
  const cols = quotes.length;

  const rows: [string, (q: (typeof quotes)[number]) => React.ReactNode][] = [
    ["Prazo de execução", (q) => q.deadline ?? <span className="text-muted">—</span>],
    ["Pagamento", (q) => q.paymentTerms ?? <span className="text-muted">—</span>],
    ["Validade", (q) => {
      const v = validityLabel(q.validUntil ? dateToDay(q.validUntil) : null, today);
      return v ? <span className={cx(v.tone === "bad" && "font-medium text-bad", v.tone === "warn" && "font-medium text-warn")}>{v.text}</span> : <span className="text-muted">sem data</span>;
    }],
    ["Avaliação", (q) => (q.supplier.rating ? <Stars value={q.supplier.rating} /> : <span className="text-muted">sem nota</span>)],
    ["O que está incluso", (q) => (q.description ? <span className="line-clamp-6 whitespace-pre-line">{q.description}</span> : <span className="text-muted">—</span>)],
    ["Arquivos", (q) => (q.files.length ? (
      <span className="flex flex-col gap-1">{q.files.map((f) => <a key={f.id} href={`/api/fornecedores/anexo/${f.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 truncate text-brand hover:underline"><Download className="size-3.5 shrink-0" /><span className="truncate">{f.fileName}</span></a>)}</span>
    ) : <span className="text-muted">nenhum</span>)],
    ["Cadastrado", (q) => `${q.createdByName.split(" ")[0]} · ${fmtRelative(q.createdAt)}`],
  ];

  return (
    <div className="animate-in">
      <Link href="/fornecedores#comparar" className="mb-6 inline-flex items-center gap-2 text-xs font-medium text-muted hover:text-brand"><ArrowLeft className="size-3.5" /> Orçamentos</Link>
      <PageHeader
        eyebrow="Comparar orçamentos"
        title={title}
        description={`${quotes.length} orçamentos${spread ? ` · diferença de ${fmtBRL(spread)} entre o mais barato e o mais caro` : ""}`}
        actions={<LinkButton href={`/fornecedores/orcamento/novo?servico=${encodeURIComponent(title)}`} variant="outline"><Plus className="size-4" />Mais um orçamento</LinkButton>}
      />

      <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(15rem, 1fr))` }}>
          {quotes.map((q) => {
            const st = quoteStatus(q.status);
            const best = q.status !== "rejected" && q.amountCents === min && spread > 0;
            const wa = whatsappNumber(q.supplier.phone);
            return (
              <div key={q.id} className={cx("flex flex-col rounded-3xl border bg-surface shadow-card", best ? "border-ok/50 ring-1 ring-ok/30" : "border-line", q.status === "rejected" && "opacity-60")}>
                <div className="border-b border-line p-4">
                  <div className="flex items-start gap-3">
                    <CategoryIcon category={q.supplier.category} />
                    <div className="min-w-0 flex-1">
                      <Link href={`/fornecedores/${q.supplierId}`} className="block truncate font-medium hover:text-brand">{q.supplier.name}</Link>
                      <p className="truncate text-xs text-muted">{q.supplier.category ?? "Sem ramo"}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    {best && <Badge tone="ok"><Trophy className="size-3" />menor preço</Badge>}
                    {q.status !== "pending" && <Badge tone={st.tone} dot>{st.short}</Badge>}
                  </div>
                  <p className="mt-2 font-display text-3xl font-semibold tabular-nums">{fmtBRL(q.amountCents)}</p>
                  <p className="h-4 text-xs text-muted">{q.status !== "rejected" && priceDiff(q.amountCents, min) ? `${priceDiff(q.amountCents, min)} · ${fmtBRL(q.amountCents - min)} a mais` : ""}</p>
                </div>
                <dl className="flex-1 divide-y divide-line text-sm">
                  {rows.map(([label, cell]) => (
                    <div key={label} className="px-4 py-2.5">
                      <dt className="text-[11px] text-muted">{label}</dt>
                      <dd className="mt-0.5 min-w-0 break-words">{cell(q)}</dd>
                    </div>
                  ))}
                </dl>
                <div className="space-y-2 border-t border-line p-4">
                  {decider && q.status === "pending" && (
                    <ChooseButton quoteId={q.id} supplier={q.supplier.name} value={fmtBRL(q.amountCents)} others={pendingIds.filter((id) => id !== q.id).length} cheapest={q.amountCents === min} />
                  )}
                  {q.status === "approved" && q.decisionNote && <p className="rounded-xl bg-ok/10 px-3 py-2 text-xs text-fg-2">“{q.decisionNote}”</p>}
                  <div className="flex gap-2">
                    <Link href={`/fornecedores/orcamento/${q.id}`} className="flex-1 rounded-xl py-2 text-center text-xs font-medium text-brand ring-1 ring-line hover:bg-bg-2">Abrir orçamento</Link>
                    {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" aria-label="WhatsApp" className="grid w-10 place-items-center rounded-xl text-ok ring-1 ring-line hover:bg-ok/10"><MessageCircle className="size-4" /></a>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
