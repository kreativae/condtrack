import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Archive, ArchiveRestore, ArrowLeft, CircleSlash, Download, FileText, MessageCircle, RotateCcw, Trophy } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { dateToDay, fmtBRL } from "@/lib/finance";
import { fmtDate, fmtDateTime, fmtRelative, nowMs } from "@/lib/format";
import { SUPPLIER_ROLES, canManageGroup, groupLabel, groupSavings, groupStats, priceDiff, quoteStatus, validityLabel, whatsappNumber } from "@/lib/suppliers";
import { loadGroupFor } from "@/lib/suppliers-server";
import { reopenGroup, setGroupArchived } from "@/app/actions/suppliers";
import { Badge, Card, LinkButton, PageHeader, buttonClass, cx } from "@/components/ui";
import { CategoryIcon } from "@/components/suppliers/look";
import { Stars } from "../../stars";
import { QuickQuote } from "../../quick-quote";
import { usedQuoteTitles } from "../../options";
import { CloseGroupButton, GroupNameButton } from "../group-actions";

export const metadata: Metadata = { title: "Cotação" };

/** Cotação: os orçamentos do mesmo serviço lado a lado, o contratado e o encerramento. */
export default async function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(...SUPPLIER_ROLES);
  const { id } = await params;
  const g = await loadGroupFor(user, id);
  if (!g) notFound();

  const today = dateToDay(new Date(nowMs()));
  const manage = canManageGroup(user.role);
  const open = g.status === "open";
  const st = groupStats(g.quotes);
  const label = groupLabel(g, st.pending);
  const chosen = g.quotes.find((q) => q.id === g.chosenQuoteId) ?? null;
  const savings = groupSavings(chosen, g.quotes);
  const shown = g.quotes.filter((q) => q.status !== "cancelled");
  const cancelled = g.quotes.filter((q) => q.status === "cancelled");
  const options = g.quotes.map((q) => ({ id: q.id, supplier: q.supplier.name, amountCents: q.amountCents, status: q.status }));
  const category = g.quotes[0]?.supplier.category ?? null;
  const [suppliers, titles] = open
    ? await Promise.all([
        db.supplier.findMany({ where: { condominiumId: g.condominiumId, archivedAt: null }, select: { id: true, name: true, category: true }, orderBy: { name: "asc" } }),
        usedQuoteTitles(g.condominiumId),
      ])
    : [[], []];

  const rows: [string, (q: (typeof shown)[number]) => React.ReactNode][] = [
    ["Prazo de execução", (q) => q.deadline ?? <span className="text-muted">—</span>],
    ["Pagamento", (q) => q.paymentTerms ?? <span className="text-muted">—</span>],
    ["Validade", (q) => {
      const v = q.status === "pending" ? validityLabel(q.validUntil ? dateToDay(q.validUntil) : null, today) : null;
      return v ? <span className={cx(v.tone === "bad" && "font-medium text-bad", v.tone === "warn" && "font-medium text-warn")}>{v.text}</span> : <span className="text-muted">{q.validUntil ? fmtDate(q.validUntil) : "sem data"}</span>;
    }],
    ["Avaliação", (q) => (q.supplier.rating ? <Stars value={q.supplier.rating} /> : <span className="text-muted">sem nota</span>)],
    ["O que está incluso", (q) => (q.description ? <span className="line-clamp-6 whitespace-pre-line">{q.description}</span> : <span className="text-muted">—</span>)],
    ["Arquivos", (q) => (q.files.length ? (
      <span className="flex flex-col gap-1">{q.files.map((f) => <a key={f.id} href={`/api/fornecedores/anexo/${f.id}`} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center gap-1 text-brand hover:underline"><Download className="size-3.5 shrink-0" /><span className="truncate">{f.fileName}</span></a>)}</span>
    ) : <span className="text-muted">nenhum</span>)],
    ["Cadastrado", (q) => `${q.createdByName.split(" ")[0]} · ${fmtRelative(q.createdAt)}`],
  ];

  return (
    <div className="animate-in">
      <Link href={g.archivedAt ? "/fornecedores?aba=historico" : "/fornecedores"} className="mb-6 inline-flex items-center gap-2 text-xs font-medium text-muted hover:text-brand"><ArrowLeft className="size-3.5" /> {g.archivedAt ? "Histórico" : "Cotações"}</Link>
      <PageHeader
        eyebrow="Cotação"
        title={<span className="flex items-start gap-3"><CategoryIcon category={category} className="mt-1" />{g.title}</span>}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={label.tone} dot>{label.text}</Badge>
            <span>{st.total} orçamento{st.total === 1 ? "" : "s"}{st.spread ? ` · de ${fmtBRL(st.min)} a ${fmtBRL(st.max)}` : ""} · criada por {g.createdByName.split(" ")[0]} em {fmtDate(g.createdAt)}</span>
          </span>
        }
        actions={
          <>
            {manage && <LinkButton href={`/relatorio/orcamentos?grupo=${g.id}`} target="_blank" variant="outline"><FileText className="size-4" />Relatório</LinkButton>}
            {open && <QuickQuote suppliers={suppliers} titles={titles} group={{ id: g.id, title: g.title }} label="Adicionar orçamento" variant={manage && st.live.length ? "outline" : "brand"} />}
            {open && manage && st.live.length > 0 && <CloseGroupButton groupId={g.id} quotes={options} cheapestId={st.cheapestId} />}
          </>
        }
      />

      {g.description && <p className="-mt-2 mb-5 max-w-3xl whitespace-pre-line text-sm text-fg-2">{g.description}</p>}

      {/* Encerrada: o que foi contratado, a economia e quem decidiu */}
      {!open && (
        <Card className={cx("mb-6 overflow-hidden", chosen && "border-ok/40")}>
          <div className="flex flex-wrap items-center gap-4 p-5">
            <span className={cx("grid size-12 shrink-0 place-items-center rounded-2xl", chosen ? "bg-ok/10 text-ok" : "bg-bg-2 text-muted")}>{chosen ? <Trophy className="size-6" /> : <CircleSlash className="size-6" />}</span>
            <div className="min-w-0 flex-1">
              {chosen ? (
                <>
                  <p className="text-xs text-muted">Contratado</p>
                  <p className="font-display text-xl font-semibold"><Link href={`/fornecedores/orcamento/${chosen.id}`} className="hover:text-brand">{chosen.supplier.name} · {fmtBRL(chosen.amountCents)}</Link></p>
                </>
              ) : (
                <p className="font-display text-lg font-semibold">Encerrada sem contratação</p>
              )}
              <p className="text-xs text-muted">Encerrada por {g.closedByName ?? "—"}{g.closedAt && ` em ${fmtDateTime(g.closedAt)}`}{g.archivedAt && ` · arquivada em ${fmtDate(g.archivedAt)}`}</p>
            </div>
            {savings && savings.vsMax > 0 && (
              <div className="rounded-2xl bg-ok/10 px-4 py-2 text-right">
                <p className="text-[11px] text-muted">Economia frente ao mais caro</p>
                <p className="font-display text-lg font-semibold text-ok tabular-nums">{fmtBRL(savings.vsMax)}</p>
                {savings.vsAvg > 0 && <p className="text-[11px] text-muted">{fmtBRL(savings.vsAvg)} abaixo da média de {savings.received}</p>}
              </div>
            )}
          </div>
          {g.closingNote && <p className="border-t border-line bg-bg-2/50 px-5 py-3 text-sm text-fg-2">“{g.closingNote}”</p>}
          {manage && (
            <div className="flex flex-wrap gap-2 border-t border-line px-5 py-3">
              {!g.archivedAt && (
                <form action={reopenGroup.bind(null, g.id)}><button className={buttonClass("ghost", "sm")}><RotateCcw className="size-4" />Reabrir</button></form>
              )}
              <form action={setGroupArchived.bind(null, g.id, !g.archivedAt)}>
                <button className={buttonClass(g.archivedAt ? "ghost" : "outline", "sm")}>
                  {g.archivedAt ? <><ArchiveRestore className="size-4" />Tirar do histórico</> : <><Archive className="size-4" />Arquivar no histórico</>}
                </button>
              </form>
              {!g.archivedAt && <GroupNameButton group={{ id: g.id, title: g.title, description: g.description }} />}
            </div>
          )}
        </Card>
      )}

      {open && manage && <div className="-mt-3 mb-4"><GroupNameButton group={{ id: g.id, title: g.title, description: g.description }} /></div>}

      {!shown.length ? (
        <Card className="p-8 text-center">
          <span className="mx-auto mb-3 grid size-14 place-items-center rounded-2xl bg-brand/10 text-brand"><FileText className="size-7" /></span>
          <p className="font-display text-lg font-semibold">Nenhum orçamento nesta cotação ainda</p>
          <p className="mt-1 text-sm text-muted">Peça pelo menos três orçamentos e cadastre cada um em <b>Adicionar orçamento</b> (dá para arrastar o PDF para a página).</p>
        </Card>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${shown.length}, minmax(15rem, 1fr))` }}>
            {shown.map((q) => {
              const qs = quoteStatus(q.status);
              const best = st.cheapestId === q.id;
              const isChosen = chosen?.id === q.id;
              const diff = q.status !== "rejected" ? priceDiff(q.amountCents, st.min) : null;
              const wa = whatsappNumber(q.supplier.phone);
              return (
                <div key={q.id} className={cx("flex flex-col rounded-3xl border bg-surface shadow-card", isChosen ? "border-ok ring-2 ring-ok/30" : best ? "border-ok/50" : "border-line", q.status === "rejected" && "opacity-60")}>
                  <div className="border-b border-line p-4">
                    <div className="flex items-start gap-3">
                      <CategoryIcon category={q.supplier.category} />
                      <div className="min-w-0 flex-1">
                        <Link href={`/fornecedores/${q.supplierId}`} className="block truncate font-medium hover:text-brand">{q.supplier.name}</Link>
                        <p className="truncate text-xs text-muted">{q.supplier.category ?? "Sem ramo"}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex min-h-5 flex-wrap items-center gap-1.5">
                      {isChosen && <Badge tone="ok"><Trophy className="size-3" />contratado</Badge>}
                      {best && !isChosen && <Badge tone="ok">menor preço</Badge>}
                      {q.status !== "pending" && !isChosen && <Badge tone={qs.tone} dot>{qs.short}</Badge>}
                    </div>
                    <p className="mt-2 font-display text-3xl font-semibold tabular-nums">{fmtBRL(q.amountCents)}</p>
                    <p className="h-4 text-xs text-muted">{diff ? `${diff} · ${fmtBRL(q.amountCents - st.min)} a mais` : ""}</p>
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
                    {open && manage && (q.status === "pending" || q.status === "approved") && (
                      <CloseGroupButton groupId={g.id} quotes={options} cheapestId={st.cheapestId} preset={q.id} label="Contratar este" variant={best ? "success" : "outline"} className="w-full" />
                    )}
                    {q.decisionNote && q.status !== "pending" && <p className={cx("rounded-xl px-3 py-2 text-xs text-fg-2", q.status === "approved" ? "bg-ok/10" : "bg-bg-2")}>“{q.decisionNote}”</p>}
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
      )}

      {cancelled.length > 0 && (
        <p className="mt-4 text-xs text-muted">
          Cancelados: {cancelled.map((q, i) => <span key={q.id}>{i > 0 && ", "}<Link href={`/fornecedores/orcamento/${q.id}`} className="hover:text-brand hover:underline">{q.supplier.name} ({fmtBRL(q.amountCents)})</Link></span>)}
        </p>
      )}
    </div>
  );
}
