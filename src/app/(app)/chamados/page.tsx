import type { Metadata } from "next";
import Link from "next/link";
import { Inbox, Plus, Search } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { nowMs } from "@/lib/format";
import { ACTIVE_STATUSES, DONE_STATUSES, TICKET_KINDS, TICKET_ROLES, avgResponseLabel, canManageTickets, type TicketKind } from "@/lib/tickets";
import { ticketCondo } from "@/lib/tickets-server";
import { TicketCard } from "@/components/tickets/ticket-card";
import { TicketKindIcon } from "@/components/tickets/look";
import { Card, Empty, Input, LinkButton, PageHeader, Stat, cx } from "@/components/ui";
import { Pager, pageParam, withPage } from "@/components/frozen";

export const metadata: Metadata = { title: "Chamados" };

const PAGE = 24;
const TABS: Record<"ativos" | "encerrados" | "todos", { label: string; where: Prisma.TicketWhereInput }> = {
  ativos: { label: "Em andamento", where: { status: { in: [...ACTIVE_STATUSES, "converted"] } } },
  encerrados: { label: "Encerrados", where: { status: { in: DONE_STATUSES } } },
  todos: { label: "Todos", where: {} },
};
type Tab = keyof typeof TABS;

export default async function TicketsPage({ searchParams }: PageProps<"/chamados">) {
  const user = await requireUser(...TICKET_ROLES);
  const sp = await searchParams;
  const manager = canManageTickets(user.role);
  const condoId = await ticketCondo(user);
  const header = (
    <PageHeader
      eyebrow="Chamados"
      title={manager ? "Chamados dos moradores" : "Meus chamados"}
      description={manager ? "Problemas, reclamações e sugestões enviados por moradores e conselho. Responda, converta em OS ou encerre." : "Abra um chamado para o síndico: um problema, uma reclamação ou uma sugestão. Você acompanha a resposta por aqui."}
      actions={!manager && condoId && <LinkButton href="/chamados/novo"><Plus className="size-4" />Abrir chamado</LinkButton>}
    />
  );
  if (!condoId) {
    return <div className="animate-in">{header}<Card><Empty icon={<Inbox className="size-8" />} title="Escolha um condomínio">Use o cartão do condomínio no menu para ver os chamados dele.</Empty></Card></div>;
  }

  const tab: Tab = typeof sp.s === "string" && sp.s in TABS ? (sp.s as Tab) : "ativos";
  const kind = typeof sp.tipo === "string" && sp.tipo in TICKET_KINDS ? (sp.tipo as TicketKind) : null;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";
  const base: Prisma.TicketWhereInput = { condominiumId: condoId, ...(!manager && { createdById: user.id }) };
  const num = Number(q.replace(/^#/, ""));
  const where: Prisma.TicketWhereInput = {
    ...base,
    ...TABS[tab].where,
    ...(kind && { kind }),
    ...(q && { OR: [{ title: { contains: q, mode: "insensitive" } }, { createdByName: { contains: q, mode: "insensitive" } }, ...(Number.isInteger(num) && num > 0 ? [{ number: num }] : [])] }),
  };
  const since = new Date(nowMs() - 30 * 86400_000);
  const [total, counts, byKind, recent] = await Promise.all([
    db.ticket.count({ where }),
    db.ticket.groupBy({ by: ["status"], where: base, _count: true }),
    db.ticket.groupBy({ by: ["kind"], where: { ...base, ...TABS[tab].where }, _count: true }),
    manager ? db.ticket.findMany({ where: { ...base, createdAt: { gte: since } }, select: { createdAt: true, answeredAt: true, status: true } }) : [],
  ]);
  const page = pageParam(sp.page, total, PAGE);
  const items = await db.ticket.findMany({
    where,
    include: { unit: { include: { building: true } }, serviceOrder: { select: { protocol: true } }, _count: { select: { messages: { where: { system: false } } } } },
    // Em andamento: quem espera há mais tempo primeiro; encerrados: os mais recentes
    orderBy: tab === "ativos" ? [{ createdAt: "asc" }] : tab === "encerrados" ? [{ closedAt: "desc" }] : [{ createdAt: "desc" }],
    skip: (page - 1) * PAGE,
    take: PAGE,
  });
  const n = (s: string) => counts.find((c) => c.status === s)?._count ?? 0;
  const now = new Date(nowMs());
  const href = (extra: Record<string, string>) => {
    const p = new URLSearchParams({ ...(tab !== "ativos" && { s: tab }), ...(kind && { tipo: kind }), ...(q && { q }), ...extra });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    const s = p.toString();
    return s ? `/chamados?${s}` : "/chamados";
  };
  const tabCount = (t: Tab) => (t === "ativos" ? n("open") + n("in_review") + n("converted") : t === "encerrados" ? n("resolved") + n("closed") : counts.reduce((a, c) => a + c._count, 0));

  return (
    <div className="animate-in">
      {header}

      {manager && (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Aguardando resposta" value={n("open")} tone={n("open") ? "warn" : undefined} href={href({ s: "", page: "" })} />
          <Stat label="Em análise" value={n("in_review")} />
          <Stat label="Viraram OS (em andamento)" value={n("converted")} tone={n("converted") ? "brand" : undefined} />
          <Stat label="Tempo médio de resposta" value={avgResponseLabel(recent)} hint={`${recent.filter((r) => r.status === "resolved").length} resolvidos em 30 dias`} />
        </div>
      )}

      {/* Abas, tipos e busca */}
      <div className="mb-5 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex w-full gap-1 rounded-xl bg-bg-2 p-1 text-sm sm:w-auto">
            {(Object.keys(TABS) as Tab[]).map((t) => (
              <Link key={t} href={href({ s: t === "ativos" ? "" : t, page: "" })} aria-current={tab === t ? "page" : undefined} className={cx("flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-center transition sm:flex-none sm:py-1.5", tab === t ? "bg-surface font-medium text-brand shadow-card" : "text-muted hover:text-fg")}>
                {TABS[t].label} <span className="font-num text-xs opacity-70">{tabCount(t)}</span>
              </Link>
            ))}
          </div>
          {manager && (
            <form className="relative ml-auto w-full sm:w-72">
              {tab !== "ativos" && <input type="hidden" name="s" value={tab} />}
              {kind && <input type="hidden" name="tipo" value={kind} />}
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <Input name="q" defaultValue={q} placeholder="Buscar assunto, nome ou #número" className="pl-9" />
            </form>
          )}
        </div>
        {byKind.length > 1 && (
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 py-1 [scrollbar-width:none] sm:-mx-1 sm:flex-wrap sm:px-1">
            {(Object.keys(TICKET_KINDS) as TicketKind[]).filter((k) => byKind.some((b) => b.kind === k)).map((k) => (
              <Link key={k} href={href({ tipo: kind === k ? "" : k, page: "" })} className={cx("inline-flex shrink-0 items-center gap-2 rounded-2xl py-1.5 pl-1.5 pr-3 text-sm ring-1 transition", kind === k ? "bg-brand-soft text-brand ring-brand" : "bg-surface text-fg-2 ring-line hover:ring-line-strong")}>
                <TicketKindIcon kind={k} size="sm" />{TICKET_KINDS[k].short}<span className="text-xs text-muted">{byKind.find((b) => b.kind === k)?._count}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {items.length ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {items.map((t) => <TicketCard key={t.id} t={t} showAuthor={manager} now={now} />)}
          </div>
          {total > PAGE && <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-5 py-3 text-xs text-muted shadow-card"><Pager page={page} pageSize={PAGE} total={total} href={(p) => withPage("/chamados", sp, p)} /></div>}
        </>
      ) : (
        <Card>
          <Empty icon={<Inbox className="size-8" />} title={q || kind ? "Nenhum chamado encontrado" : tab === "ativos" ? (manager ? "Nenhum chamado em andamento" : "Nenhum chamado em andamento") : "Nenhum chamado aqui"}>
            {q || kind ? <Link href={href({ q: "", tipo: "" })} className="font-medium text-brand hover:underline">Limpar filtros</Link>
              : manager ? "Quando um morador ou conselheiro abrir um chamado, ele aparece aqui e você recebe o aviso."
              : <span className="flex flex-col items-center gap-3">Algo quebrado, um incômodo ou uma ideia? Abra um chamado e o síndico responde por aqui.<LinkButton href="/chamados/novo" size="sm"><Plus className="size-4" />Abrir chamado</LinkButton></span>}
          </Empty>
        </Card>
      )}
    </div>
  );
}
