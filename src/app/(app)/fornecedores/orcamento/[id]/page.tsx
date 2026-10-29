import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Ban, Copy, MessageCircle, Pencil, Scale } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { dateToDay, fmtBRL, fmtDayBR } from "@/lib/finance";
import { fmtDateTime, nowMs } from "@/lib/format";
import { SUPPLIER_ROLES, canChangeQuote, canDecideQuote, quoteExpired, quoteStatus, whatsappNumber } from "@/lib/suppliers";
import { loadQuoteFor } from "@/lib/suppliers-server";
import { cancelQuote } from "@/app/actions/suppliers";
import { Alert, Badge, Card, CardHeader, LinkButton, PageHeader, buttonClass, cx } from "@/components/ui";
import { DecidePanel, QuoteFiles } from "../../quote-parts";
import { CategoryIcon } from "@/components/suppliers/look";

export const metadata: Metadata = { title: "Orçamento" };

export default async function QuotePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ falhou?: string }> }) {
  const user = await requireUser(...SUPPLIER_ROLES);
  const [{ id }, { falhou }] = await Promise.all([params, searchParams]);
  const q = await loadQuoteFor(user, id);
  if (!q) notFound();

  const st = quoteStatus(q.status);
  const pending = q.status === "pending";
  const editable = canChangeQuote(q, user);
  const decider = canDecideQuote(user.role) && pending;
  const today = dateToDay(new Date(nowMs()));
  const expired = pending && quoteExpired(q.validUntil ? dateToDay(q.validUntil) : null, today);
  const wa = whatsappNumber(q.supplier.phone);

  // Os outros orçamentos da mesma cotação, sem os cancelados
  const group = q.groupId ? await db.quoteGroup.findUnique({ where: { id: q.groupId }, select: { id: true, title: true, status: true, archivedAt: true } }) : null;
  const others = q.groupId
    ? await db.supplierQuote.findMany({
        where: { groupId: q.groupId, id: { not: q.id }, status: { not: "cancelled" } },
        include: { supplier: { select: { name: true } } },
        orderBy: { amountCents: "asc" },
      })
    : [];
  const cheaperExists = others.some((o) => o.status !== "rejected" && o.amountCents < q.amountCents);

  const facts: [string, string | null][] = [
    ["Válido até", q.validUntil ? fmtDayBR(q.validUntil) : null],
    ["Prazo de execução", q.deadline],
    ["Pagamento", q.paymentTerms],
  ];

  return (
    <div className="animate-in">
      <Link href={group ? `/fornecedores/cotacao/${group.id}` : "/fornecedores"} className="mb-6 inline-flex items-center gap-2 text-xs font-medium text-muted hover:text-brand"><ArrowLeft className="size-3.5" /> {group ? `Cotação: ${group.title}` : "Cotações"}</Link>
      <PageHeader
        eyebrow="Orçamento"
        title={q.title}
        description={<Link href={`/fornecedores/${q.supplierId}`} className="inline-flex items-center gap-2 font-medium text-brand hover:underline"><CategoryIcon category={q.supplier.category} size="sm" />{q.supplier.name}</Link>}
        actions={editable && <LinkButton href={`/fornecedores/orcamento/${id}/editar`} variant="outline"><Pencil className="size-4" />Editar</LinkButton>}
      />

      {falhou && <div className="mb-4"><Alert tone="warn">O orçamento foi salvo, mas {falhou === "1" ? "1 arquivo não foi enviado" : `${falhou} arquivos não foram enviados`}. Anexe de novo abaixo.</Alert></div>}

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          <Card className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs text-muted">Valor</p>
                <p className="font-display text-3xl font-semibold tabular-nums">{fmtBRL(q.amountCents)}</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {expired && <Badge tone="bad">validade vencida</Badge>}
                <Badge tone={st.tone} dot>{st.label}</Badge>
              </div>
            </div>
            {facts.some(([, v]) => v) && (
              <dl className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-3">
                {facts.filter(([, v]) => v).map(([k, v]) => (
                  <div key={k}><dt className="text-[11px] text-muted">{k}</dt><dd className={cx("text-sm", k === "Válido até" && expired && "text-bad")}>{v}</dd></div>
                ))}
              </dl>
            )}
            {q.description && <p className="mt-4 whitespace-pre-line border-t border-line pt-4 text-sm text-fg-2">{q.description}</p>}
          </Card>

          <Card>
            <CardHeader title="Arquivos" subtitle="PDF ou fotos do orçamento enviado pelo fornecedor." />
            <div className="px-5 pb-5"><QuoteFiles quoteId={id} editable={editable} files={q.files.map((f) => ({ id: f.id, fileName: f.fileName, mimeType: f.mimeType, sizeBytes: f.sizeBytes }))} /></div>
          </Card>

          {others.length > 0 && (
            <Card>
              <CardHeader
                title={<span className="flex items-center gap-2"><Scale className="size-4 text-brand" />Outros orçamentos da cotação</span>}
                action={group && <Link href={`/fornecedores/cotacao/${group.id}`} className="text-xs font-medium text-brand hover:underline">Comparar lado a lado</Link>}
              />
              <div className="divide-y divide-line border-t border-line">
                {[...others, q].sort((a, b) => a.amountCents - b.amountCents).map((o) => {
                  const ost = quoteStatus(o.status);
                  const self = o.id === q.id;
                  return (
                    <Link key={o.id} href={`/fornecedores/orcamento/${o.id}`} className={cx("flex items-center gap-3 px-5 py-2.5 text-sm transition hover:bg-bg-2", self && "bg-brand-soft/50")}>
                      <span className="min-w-0 flex-1 truncate">{self ? <b>{o.supplier.name} (este)</b> : o.supplier.name}</span>
                      <Badge tone={ost.tone}>{ost.short}</Badge>
                      <span className="w-28 shrink-0 text-right font-semibold tabular-nums">{fmtBRL(o.amountCents)}</span>
                    </Link>
                  );
                })}
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-5">
          {decider && (
            <Card className="p-5" brand>
              <p className="mb-1 font-medium">Sua decisão</p>
              <p className="mb-4 text-xs text-muted">Quem cadastrou recebe o aviso. Depois de decidido, o orçamento não muda mais.</p>
              <DecidePanel quoteId={id} cheaperExists={cheaperExists} />
            </Card>
          )}
          {pending && !decider && (
            <Card className="p-5">
              <p className="text-sm text-fg-2">Aguardando a decisão do síndico. Ele recebeu o aviso{others.some((o) => o.status === "pending") ? " e vê os outros orçamentos deste serviço lado a lado" : ""}.</p>
            </Card>
          )}

          <Card className="p-5">
            <p className="mb-3 text-xs font-medium text-muted">Histórico</p>
            <ol className="space-y-3 text-sm">
              <li><b>{q.createdByName}</b> cadastrou <span className="text-muted">· {fmtDateTime(q.createdAt)}</span></li>
              {q.decidedAt && (
                <li>
                  <b>{q.decidedByName}</b> {q.status === "approved" ? "aprovou" : q.status === "rejected" ? "recusou" : "cancelou"} <span className="text-muted">· {fmtDateTime(q.decidedAt)}</span>
                  {q.decisionNote && <p className="mt-1 whitespace-pre-line rounded-xl bg-bg-2 px-3 py-2 text-fg-2">“{q.decisionNote}”</p>}
                </li>
              )}
            </ol>
          </Card>

          <div className="flex flex-col gap-2">
            {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className={buttonClass("outline")}><MessageCircle className="size-4 text-ok" />WhatsApp do fornecedor</a>}
            {group?.status === "open" && !group.archivedAt && <LinkButton href={`/fornecedores/orcamento/novo?grupo=${group.id}`} variant="outline"><Copy className="size-4" />Outro orçamento desta cotação</LinkButton>}
            {editable && (
              <form action={cancelQuote.bind(null, id)}>
                <button className={buttonClass("ghost") + " w-full text-muted"}><Ban className="size-4" />Cancelar orçamento</button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
