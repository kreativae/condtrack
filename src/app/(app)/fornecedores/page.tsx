import type { Metadata } from "next";
import Link from "next/link";
import { Archive, CheckCircle2, CircleSlash, FileText, FolderOpen, Handshake, Hourglass, Mail, MessageCircle, Phone, Plus, Search, Trophy } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { adminScope } from "@/lib/admin-scope-server";
import { dateToDay, fmtBRL } from "@/lib/finance";
import { fmtDate, fmtRelative, nowMs } from "@/lib/format";
import {
  QUOTE_STATUS, SUPPLIER_ROLES, canDecideQuote, groupLabel, groupStats, quoteStatus, supplierLetter, validityLabel, whatsappNumber, type QuoteStatus,
} from "@/lib/suppliers";
import { supplierCondo } from "@/lib/suppliers-server";
import { Badge, Card, Empty, LinkButton, PageHeader, cx } from "@/components/ui";
import { CategoryIcon } from "@/components/suppliers/look";
import { Stars } from "./stars";
import { QuickQuote } from "./quick-quote";
import { usedQuoteTitles } from "./options";
import { GroupNameButton } from "./cotacao/group-actions";

export const metadata: Metadata = { title: "Fornecedores" };

type SP = Record<string, string | undefined>;
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser(...SUPPLIER_ROLES);
  const sp = await searchParams;
  const scope = await adminScope(user);
  const condoId = await supplierCondo(user);
  const tab = sp.aba === "agenda" ? "agenda" : sp.aba === "historico" ? "historico" : "cotacoes";

  if (!condoId) {
    return (
      <div className="animate-in">
        <PageHeader eyebrow="Fornecedores" title="Fornecedores" />
        <Card><Empty icon={<Handshake className="size-8" />} title="Escolha um condomínio">Use o cartão do condomínio no menu para ver os fornecedores e orçamentos dele.</Empty></Card>
      </div>
    );
  }

  const decider = canDecideQuote(user.role);
  const [pendingCount, supplierCount, archivedCount, pickable, titles] = await Promise.all([
    db.supplierQuote.count({ where: { condominiumId: condoId, status: "pending" } }),
    db.supplier.count({ where: { condominiumId: condoId, archivedAt: null } }),
    db.quoteGroup.count({ where: { condominiumId: condoId, archivedAt: { not: null } } }),
    db.supplier.findMany({ where: { condominiumId: condoId, archivedAt: null }, select: { id: true, name: true, category: true }, orderBy: { name: "asc" } }),
    usedQuoteTitles(condoId),
  ]);
  const tabs = [
    ["cotacoes", "Cotações", pendingCount, "warn"],
    ["agenda", "Agenda de fornecedores", supplierCount, "muted"],
    ["historico", "Histórico", archivedCount, "muted"],
  ] as const;

  return (
    <div className="animate-in">
      <PageHeader
        eyebrow={scope?.name ?? "Fornecedores"}
        title="Fornecedores"
        description={decider ? "Agenda de contatos e cotações: o zelador cadastra os orçamentos, você compara, contrata e encerra." : "Agenda de contatos e cotações. Arraste o PDF para a página para cadastrar um orçamento."}
        actions={
          <>
            {decider && <LinkButton href="/fornecedores/relatorio" variant="outline"><FileText className="size-4" />Relatório</LinkButton>}
            <LinkButton href="/fornecedores/novo" variant="outline"><Plus className="size-4" />Fornecedor</LinkButton>
            <QuickQuote suppliers={pickable} titles={titles} />
          </>
        }
      />

      <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-line [scrollbar-width:none]">
        {tabs.map(([k, l, n, tone]) => (
          <Link key={k} href={k === "cotacoes" ? "/fornecedores" : `/fornecedores?aba=${k}`} className={cx("-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition", tab === k ? "border-brand text-brand" : "border-transparent text-muted hover:text-fg")}>
            {l}
            {!!n && <span className={cx("rounded-full px-1.5 text-[11px] font-semibold", tone === "warn" ? "bg-warn/15 text-warn" : "bg-bg-2 text-muted")}>{n}</span>}
          </Link>
        ))}
      </nav>

      {tab === "agenda" ? <Agenda condoId={condoId} sp={sp} manage={decider} /> : tab === "historico" ? <History condoId={condoId} sp={sp} decider={decider} /> : <Groups condoId={condoId} sp={sp} decider={decider} />}
    </div>
  );
}

/* ───────────── Cotações ───────────── */

/** Quantas cotações cabem em cada coluna do quadro; o resto fica em "Ver todas" (lista com busca). */
const COLUMN_MAX = { open: 8, closed: 6 };

const groupInclude = {
  quotes: { select: { id: true, amountCents: true, status: true, createdAt: true, supplier: { select: { name: true, category: true } } }, orderBy: { amountCents: "asc" as const } },
} as const;
type GroupData = {
  id: string; title: string; status: string; archivedAt: Date | null; chosenQuoteId: string | null; closedAt: Date | null; createdAt: Date; closingNote: string | null;
  quotes: { id: string; amountCents: number; status: string; createdAt: Date; supplier: { name: string; category: string | null } }[];
};
/** Última novidade da cotação (orçamento novo ou criação) */
const lastActivity = (g: GroupData) => Math.max(g.createdAt.getTime(), ...g.quotes.map((q) => q.createdAt.getTime()));

async function Groups({ condoId, sp, decider }: { condoId: string; sp: SP; decider: boolean }) {
  const today = dateToDay(new Date(nowMs()));
  const yearStart = new Date(`${today.slice(0, 4)}-01-01T00:00:00-03:00`);
  const search = (sp.q ?? "").trim().slice(0, 80);
  const quoteStatusList = sp.status && (sp.status in QUOTE_STATUS || sp.status === "todos") ? (sp.status as QuoteStatus | "todos") : null;
  const groupList = sp.ver === "abertas" || sp.ver === "encerradas" ? sp.ver : null;

  const [open, closed, counts, approvedYear, pendingQuotes] = await Promise.all([
    db.quoteGroup.findMany({ where: { condominiumId: condoId, status: "open", archivedAt: null }, include: groupInclude }),
    db.quoteGroup.findMany({ where: { condominiumId: condoId, status: "closed", archivedAt: null }, include: groupInclude, orderBy: { closedAt: "desc" } }),
    db.supplierQuote.groupBy({ by: ["status"], where: { condominiumId: condoId }, _count: true }),
    db.supplierQuote.aggregate({ where: { condominiumId: condoId, status: "approved", decidedAt: { gte: yearStart } }, _sum: { amountCents: true }, _count: true }),
    db.supplierQuote.findMany({ where: { condominiumId: condoId, status: "pending" }, select: { createdAt: true }, orderBy: { createdAt: "asc" }, take: 1 }),
  ]);
  const countOf = (s: string) => counts.find((c) => c.status === s)?._count ?? 0;
  const total = counts.reduce((n, c) => n + c._count, 0);
  // Em andamento: primeiro as que esperam decisão, depois a novidade mais recente
  open.sort((a, b) => Number(b.quotes.some((q) => q.status === "pending")) - Number(a.quotes.some((q) => q.status === "pending")) || lastActivity(b) - lastActivity(a));

  if (!total && !open.length && !closed.length) {
    return (
      <Card className="overflow-hidden">
        <div className="grid gap-6 p-8 sm:grid-cols-[auto_1fr] sm:items-center">
          <span className="mx-auto grid size-20 place-items-center rounded-3xl bg-brand/10 text-brand"><FolderOpen className="size-9" /></span>
          <div className="text-center sm:text-left">
            <p className="font-display text-xl font-semibold">Nenhuma cotação ainda</p>
            <p className="mt-1 text-sm text-muted">Crie uma cotação para o serviço (ex.: <b>Pintura da área externa</b>) e junte nela os orçamentos de cada fornecedor. Também dá para simplesmente <b>arrastar o PDF</b> para esta página.</p>
            <div className="mt-4 flex justify-center sm:justify-start"><GroupNameButton /></div>
          </div>
        </div>
        <div className="grid border-t border-line text-center text-xs text-muted sm:grid-cols-3">
          {[["1", "Crie a cotação do serviço"], ["2", "Junte os orçamentos dos fornecedores"], ["3", "O síndico contrata e encerra"]].map(([n, t]) => (
            <p key={n} className="flex items-center justify-center gap-2 px-4 py-3 max-sm:border-t max-sm:border-line sm:border-l sm:first:border-l-0"><span className="grid size-5 place-items-center rounded-full bg-bg-2 text-[11px] font-semibold text-fg-2">{n}</span>{t}</p>
          ))}
        </div>
      </Card>
    );
  }

  const kpis: { label: string; value: string; hint: string; icon: typeof Hourglass; tone: "warn" | "ok" | "brand" | "muted"; href: string }[] = [
    { label: decider ? "Orçamentos esperando você" : "Orçamentos esperando o síndico", value: String(countOf("pending")), hint: pendingQuotes[0] ? `mais antigo ${fmtRelative(pendingQuotes[0].createdAt)}` : "nada pendente", icon: Hourglass, tone: countOf("pending") ? "warn" : "muted", href: "/fornecedores?status=pending" },
    { label: `Contratado em ${today.slice(0, 4)}`, value: fmtBRL(approvedYear._sum.amountCents ?? 0), hint: plural(approvedYear._count, "orçamento aprovado", "orçamentos aprovados"), icon: CheckCircle2, tone: "ok", href: "/fornecedores?status=approved" },
    { label: "Cotações em andamento", value: String(open.length), hint: closed.length ? `${plural(closed.length, "encerrada", "encerradas")} para arquivar` : "nenhuma encerrada esperando", icon: FolderOpen, tone: "brand", href: "/fornecedores?ver=abertas" },
  ];

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {kpis.map((k, i) => (
          <Link key={k.label} href={k.href} className={cx("group rounded-2xl border border-line bg-surface p-4 shadow-card transition hover:border-line-strong", i === 2 && "max-lg:col-span-2")}>
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs text-muted">{k.label}</p>
              <span className={cx("grid size-8 place-items-center rounded-xl", { warn: "bg-warn/10 text-warn", ok: "bg-ok/10 text-ok", brand: "bg-brand/10 text-brand", muted: "bg-bg-2 text-muted" }[k.tone])}><k.icon className="size-4" /></span>
            </div>
            <p className="mt-1 truncate font-display text-lg font-semibold tabular-nums sm:text-2xl">{k.value}</p>
            <p className="truncate text-[11px] text-muted">{k.hint}</p>
          </Link>
        ))}
      </div>

      {quoteStatusList || (search && !groupList) ? (
        <QuoteSearch condoId={condoId} status={quoteStatusList ?? "todos"} search={search} counts={{ pending: countOf("pending"), approved: countOf("approved"), rejected: countOf("rejected"), cancelled: countOf("cancelled"), todos: total }} today={today} />
      ) : groupList ? (
        <GroupList title={groupList === "abertas" ? "Cotações em andamento" : "Cotações encerradas"} groups={(groupList === "abertas" ? open : closed).filter((g) => !search || norm(g.title).includes(norm(search)))} search={search} ver={groupList} />
      ) : (
        <section className="grid gap-5 lg:grid-cols-[1.25fr_1fr]">
          <Column title="Em andamento" icon={FolderOpen} tone="warn" count={open.length} href="/fornecedores?ver=abertas" empty="Nenhuma cotação em andamento." more={open.length - COLUMN_MAX.open} action={<GroupNameButton compact />}>
            <div className="grid gap-2 xl:grid-cols-2">{open.slice(0, COLUMN_MAX.open).map((g) => <GroupCard key={g.id} g={g} />)}</div>
          </Column>
          <Column title="Encerradas" icon={CheckCircle2} tone="ok" count={closed.length} href="/fornecedores?ver=encerradas" empty="Nenhuma encerrada esperando arquivo." more={closed.length - COLUMN_MAX.closed} action={<Link href="/fornecedores?aba=historico" className="text-xs font-medium text-brand hover:underline">Histórico</Link>}>
            {closed.slice(0, COLUMN_MAX.closed).map((g) => <GroupCard key={g.id} g={g} />)}
          </Column>
        </section>
      )}
    </div>
  );
}

function Column({ title, icon: Icon, tone, count, href, empty, more = 0, action, children }: { title: string; icon: typeof Hourglass; tone: "warn" | "ok" | "muted"; count: number; href: string; empty: string; more?: number; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-3xl bg-bg-2/60 p-3">
      <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 px-1">
        <Icon className={cx("size-4", { warn: "text-warn", ok: "text-ok", muted: "text-muted" }[tone])} />
        <h2 className="whitespace-nowrap text-sm font-semibold">{title}</h2>
        <span className="rounded-full bg-surface px-2 text-xs font-semibold text-muted ring-1 ring-line">{count}</span>
        <span className="ml-auto flex items-center gap-3 whitespace-nowrap">{action}{count > 0 && <Link href={href} className="text-xs font-medium text-brand hover:underline">Ver todas</Link>}</span>
      </div>
      <div className="space-y-2">
        {count ? children : <p className="rounded-2xl border border-dashed border-line-strong px-4 py-6 text-center text-xs text-muted">{empty}</p>}
        {more > 0 && <Link href={href} className="block rounded-xl border border-dashed border-line-strong py-2.5 text-center text-xs font-medium text-brand hover:bg-surface">Ver mais {more}</Link>}
      </div>
    </div>
  );
}

/** Cartão da cotação: situação, faixa de preço com barras e, encerrada, o contratado */
function GroupCard({ g }: { g: GroupData }) {
  const st = groupStats(g.quotes);
  const label = groupLabel(g, st.pending);
  const chosen = g.quotes.find((q) => q.id === g.chosenQuoteId);
  const category = g.quotes[0]?.supplier.category ?? null;
  return (
    <Link href={`/fornecedores/cotacao/${g.id}`} className="block rounded-2xl border border-line bg-surface p-3.5 shadow-card transition hover:-translate-y-0.5 hover:border-line-strong hover:shadow-pop">
      <div className="flex items-start gap-3">
        <CategoryIcon category={category} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{g.title}</p>
          <p className="truncate text-xs text-muted">{g.quotes.length ? `${plural(g.quotes.length, "orçamento", "orçamentos")}${st.spread ? ` · ${fmtBRL(st.min)} a ${fmtBRL(st.max)}` : ""}` : "sem orçamentos ainda"}</p>
        </div>
      </div>
      {g.status === "open" && st.live.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {st.live.slice(0, 3).map((q) => (
            <div key={q.id}>
              <div className="flex items-center gap-2 text-[11px]">
                <span className="min-w-0 flex-1 truncate text-fg-2">{q.supplier.name}</span>
                <span className="shrink-0 font-semibold tabular-nums">{fmtBRL(q.amountCents)}</span>
              </div>
              <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-bg-2">
                <div className={cx("h-full rounded-full", q.id === st.cheapestId ? "bg-ok" : "bg-brand/50")} style={{ width: `${Math.max(8, (q.amountCents / (st.max || 1)) * 100)}%` }} />
              </div>
            </div>
          ))}
          {st.live.length > 3 && <p className="text-[11px] text-muted">+ {st.live.length - 3}</p>}
        </div>
      )}
      {g.status === "closed" && (
        <p className={cx("mt-3 flex items-center gap-1.5 truncate rounded-xl px-2.5 py-1.5 text-xs", chosen ? "bg-ok/10 text-fg-2" : "bg-bg-2 text-muted")}>
          {chosen ? <><Trophy className="size-3.5 shrink-0 text-ok" /><b className="truncate font-medium">{chosen.supplier.name}</b><span className="ml-auto shrink-0 font-semibold tabular-nums">{fmtBRL(chosen.amountCents)}</span></> : <><CircleSlash className="size-3.5 shrink-0" /><span className="truncate">{g.closingNote ?? "sem contratação"}</span></>}
        </p>
      )}
      <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
        <Badge tone={label.tone} dot>{label.text}</Badge>
        <span className="text-muted">{g.closedAt ? `encerrada ${fmtRelative(g.closedAt)}` : fmtRelative(new Date(lastActivity(g)))}</span>
      </div>
    </Link>
  );
}

function GroupList({ title, groups, search, ver }: { title: string; groups: GroupData[]; search: string; ver: string }) {
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Link href="/fornecedores" className="text-xs font-medium text-brand hover:underline">← Quadro</Link>
        <h2 className="font-display text-lg font-semibold">{title}</h2>
      </div>
      <SearchBox action="/fornecedores" hidden={{ ver }} value={search} placeholder="Buscar cotação pelo serviço" />
      {!groups.length ? <p className="rounded-2xl bg-bg-2 px-4 py-6 text-center text-sm text-muted">{search ? `Nenhuma cotação com “${search}”.` : "Nada aqui."}</p> : (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{groups.map((g) => <GroupCard key={g.id} g={g} />)}</div>
      )}
    </section>
  );
}

function SearchBox({ action, hidden, value, placeholder }: { action: string; hidden: Record<string, string>; value: string; placeholder: string }) {
  return (
    <form action={action} className="relative mb-3">
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
      <input name="q" defaultValue={value} placeholder={placeholder} className="h-11 w-full rounded-2xl border border-line-strong bg-surface pl-10 pr-3 text-sm text-fg shadow-card placeholder:text-muted/70 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15" />
    </form>
  );
}

/** Lista de orçamentos (dos números do topo): filtro por situação e busca por serviço ou fornecedor */
async function QuoteSearch({ condoId, status, search, counts, today }: { condoId: string; status: QuoteStatus | "todos"; search: string; counts: Record<string, number>; today: string }) {
  const quotes = await db.supplierQuote.findMany({
    where: {
      condominiumId: condoId,
      ...(status !== "todos" && { status }),
      ...(search && { OR: [{ title: { contains: search, mode: "insensitive" as const } }, { supplier: { name: { contains: search, mode: "insensitive" as const } } }] }),
    },
    include: { supplier: { select: { name: true, category: true } }, _count: { select: { files: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const filters: [string, string][] = [["pending", "Aguardando"], ["approved", "Aprovados"], ["rejected", "Recusados"], ["cancelled", "Cancelados"], ["todos", "Todos"]];
  return (
    <section>
      <SearchBox action="/fornecedores" hidden={{ status }} value={search} placeholder="Buscar orçamento por serviço ou fornecedor" />
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <Link href="/fornecedores" className="mr-1 text-xs font-medium text-brand hover:underline">← Quadro</Link>
        {filters.map(([k, l]) => (
          <Link key={k} href={`/fornecedores?status=${k}${search ? `&q=${encodeURIComponent(search)}` : ""}`} className={cx("rounded-full px-3 py-1 text-xs font-medium ring-1 transition", status === k ? "bg-brand-soft text-brand ring-brand" : "text-fg-2 ring-line-strong hover:bg-bg-2")}>
            {l} <span className="text-muted">{counts[k]}</span>
          </Link>
        ))}
      </div>
      {!quotes.length ? (
        <p className="rounded-2xl bg-bg-2 px-4 py-6 text-center text-sm text-muted">{search ? `Nenhum orçamento com “${search}”.` : "Nada aqui."}</p>
      ) : (
        <Card className="divide-y divide-line">
          {quotes.map((q) => {
            const st = quoteStatus(q.status);
            const validity = q.status === "pending" ? validityLabel(q.validUntil ? dateToDay(q.validUntil) : null, today) : null;
            return (
              <Link key={q.id} href={`/fornecedores/orcamento/${q.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 transition hover:bg-bg-2 sm:flex-nowrap">
                <CategoryIcon category={q.supplier.category} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{q.title}</p>
                  <p className="truncate text-xs text-muted">{q.supplier.name} · por {q.createdByName} {fmtRelative(q.createdAt)}{q._count.files > 0 && ` · ${plural(q._count.files, "arquivo", "arquivos")}`}</p>
                </div>
                <div className="flex items-center gap-2 max-sm:w-full max-sm:justify-end">
                  {validity && validity.tone !== "muted" && <Badge tone={validity.tone}>{validity.text}</Badge>}
                  <Badge tone={st.tone} dot>{st.short}</Badge>
                  <span className="w-28 text-right text-sm font-semibold tabular-nums">{fmtBRL(q.amountCents)}</span>
                </div>
              </Link>
            );
          })}
        </Card>
      )}
    </section>
  );
}

/* ───────────── Histórico ───────────── */

async function History({ condoId, sp, decider }: { condoId: string; sp: SP; decider: boolean }) {
  const search = (sp.q ?? "").trim().slice(0, 80);
  const year = /^\d{4}$/.test(sp.ano ?? "") ? Number(sp.ano) : null;
  const all = await db.quoteGroup.findMany({ where: { condominiumId: condoId, archivedAt: { not: null } }, include: groupInclude, orderBy: { closedAt: "desc" } });
  const years = [...new Set(all.map((g) => (g.closedAt ?? g.createdAt).getFullYear()))].sort((a, b) => b - a);
  const list = all.filter((g) => (!year || (g.closedAt ?? g.createdAt).getFullYear() === year) && (!search || norm(`${g.title} ${g.quotes.map((q) => q.supplier.name).join(" ")}`).includes(norm(search))));
  const contracted = list.reduce((n, g) => n + (g.quotes.find((q) => q.id === g.chosenQuoteId)?.amountCents ?? 0), 0);

  if (!all.length) {
    return (
      <Card>
        <Empty icon={<Archive className="size-8" />} title="O histórico começa quando uma cotação é arquivada">
          Depois de encerrar uma cotação (com o contratado ou sem contratação), arquive para ela sair do quadro e ficar aqui, com tudo guardado para consulta e relatório.
        </Empty>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1 basis-64"><SearchBox action="/fornecedores" hidden={{ aba: "historico", ...(year && { ano: String(year) }) }} value={search} placeholder="Buscar no histórico por serviço ou fornecedor" /></div>
        <div className="mb-3 flex gap-1.5">
          {[null, ...years].map((y) => (
            <Link key={y ?? "todos"} href={`/fornecedores?aba=historico${y ? `&ano=${y}` : ""}${search ? `&q=${encodeURIComponent(search)}` : ""}`} className={cx("rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition", year === y ? "bg-brand-soft text-brand ring-brand" : "text-fg-2 ring-line-strong hover:bg-bg-2")}>{y ?? "Todos"}</Link>
          ))}
        </div>
      </div>
      <p className="text-sm text-muted">{plural(list.length, "cotação", "cotações")} · {fmtBRL(contracted)} contratados{decider && <> · <Link href="/fornecedores/relatorio?situacao=arquivadas" className="font-medium text-brand hover:underline">gerar relatório</Link></>}</p>
      {!list.length ? <p className="rounded-2xl bg-bg-2 px-4 py-6 text-center text-sm text-muted">Nada encontrado.</p> : (
        <Card className="divide-y divide-line">
          {list.map((g) => {
            const chosen = g.quotes.find((q) => q.id === g.chosenQuoteId);
            return (
              <Link key={g.id} href={`/fornecedores/cotacao/${g.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 transition hover:bg-bg-2 sm:flex-nowrap">
                <CategoryIcon category={g.quotes[0]?.supplier.category ?? null} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{g.title}</p>
                  <p className="truncate text-xs text-muted">{plural(g.quotes.length, "orçamento", "orçamentos")} · encerrada {g.closedAt ? fmtDate(g.closedAt) : "—"}</p>
                </div>
                <div className="flex items-center gap-2 max-sm:w-full max-sm:justify-end">
                  {chosen ? <span className="truncate text-xs text-fg-2"><Trophy className="mr-1 inline size-3.5 text-ok" />{chosen.supplier.name}</span> : <Badge>sem contratação</Badge>}
                  <span className="w-28 text-right text-sm font-semibold tabular-nums">{chosen ? fmtBRL(chosen.amountCents) : "—"}</span>
                </div>
              </Link>
            );
          })}
        </Card>
      )}
    </div>
  );
}

/* ───────────── Agenda ───────────── */

async function Agenda({ condoId, sp, manage }: { condoId: string; sp: SP; manage: boolean }) {
  const q = (sp.q ?? "").trim();
  const ramo = sp.ramo ?? "";
  const archived = manage && sp.arquivados === "1";
  const all = await db.supplier.findMany({
    where: { condominiumId: condoId, archivedAt: archived ? { not: null } : null },
    include: { quotes: { select: { status: true, amountCents: true, createdAt: true } } },
    orderBy: { name: "asc" },
  });
  const byRamo = new Map<string, number>();
  for (const s of all) if (s.category) byRamo.set(s.category, (byRamo.get(s.category) ?? 0) + 1);
  const ramos = [...byRamo.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"));
  const w = norm(q);
  const list = all
    .filter((s) => (!ramo || s.category === ramo) && (!w || norm([s.name, s.category, s.contactName, s.phone, s.email, s.notes].filter(Boolean).join(" ")).includes(w)))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));
  const letters = [...new Set(list.map((s) => supplierLetter(s.name)))];
  const href = (extra: Record<string, string>) => {
    const p = new URLSearchParams({ aba: "agenda", ...(q && { q }), ...(ramo && { ramo }), ...(archived && { arquivados: "1" }), ...extra });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    return `/fornecedores?${p}`;
  };

  return (
    <div className="space-y-5">
      <form className="flex flex-wrap gap-2" action="/fornecedores">
        <input type="hidden" name="aba" value="agenda" />
        {ramo && <input type="hidden" name="ramo" value={ramo} />}
        {archived && <input type="hidden" name="arquivados" value="1" />}
        <label className="relative min-w-0 flex-1 basis-60">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input name="q" defaultValue={q} placeholder="Buscar por nome, ramo, contato ou telefone" className="h-11 w-full rounded-2xl border border-line-strong bg-surface pl-10 pr-3 text-sm text-fg shadow-card placeholder:text-muted/70 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15" />
        </label>
        {manage && (
          <Link href={href({ arquivados: archived ? "" : "1" })} className="inline-flex h-11 items-center gap-1.5 rounded-2xl px-3 text-sm text-muted hover:bg-bg-2 hover:text-fg">
            <Archive className="size-4" />{archived ? "Ver ativos" : "Arquivados"}
          </Link>
        )}
      </form>

      {ramos.length > 1 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 py-1 [scrollbar-width:none] sm:-mx-1 sm:flex-wrap sm:px-1">
          <Link href={href({ ramo: "" })} className={cx("inline-flex shrink-0 items-center gap-2 rounded-2xl py-1.5 pl-1.5 pr-3 text-sm ring-1 transition", !ramo ? "bg-brand-soft text-brand ring-brand" : "bg-surface text-fg-2 ring-line hover:ring-line-strong")}>
            <span className="grid size-7 place-items-center rounded-xl bg-bg-2 text-xs font-semibold">{all.length}</span>Todos
          </Link>
          {ramos.map(([c, n]) => (
            <Link key={c} href={href({ ramo: ramo === c ? "" : c })} className={cx("inline-flex shrink-0 items-center gap-2 rounded-2xl py-1.5 pl-1.5 pr-3 text-sm ring-1 transition", ramo === c ? "bg-brand-soft text-brand ring-brand" : "bg-surface text-fg-2 ring-line hover:ring-line-strong")}>
              <CategoryIcon category={c} size="sm" className="size-7" />{c}<span className="text-xs text-muted">{n}</span>
            </Link>
          ))}
        </div>
      )}

      {!list.length ? (
        <Card>
          <Empty icon={<Handshake className="size-8" />} title={all.length ? "Nenhum fornecedor encontrado" : archived ? "Nenhum fornecedor arquivado" : "Sua agenda de fornecedores começa aqui"}>
            {all.length ? "Tente outra busca ou outro ramo." : !archived && (
              <>Quem presta serviço ou vende material para o condomínio, com telefone, WhatsApp e o histórico de orçamentos de cada um.
                <span className="mt-4 flex justify-center"><LinkButton href="/fornecedores/novo"><Plus className="size-4" />Cadastrar fornecedor</LinkButton></span>
              </>
            )}
          </Empty>
        </Card>
      ) : (
        <div className="space-y-6">
          {letters.length > 3 && (
            <div className="flex flex-wrap gap-1">
              {letters.map((l) => <a key={l} href={`#letra-${l}`} className="grid size-7 place-items-center rounded-lg text-xs font-semibold text-fg-2 ring-1 ring-line hover:bg-bg-2 hover:text-brand">{l}</a>)}
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((s, i) => {
              const l = supplierLetter(s.name);
              // O índice A–Z pula para o primeiro cartão de cada letra
              const first = i === 0 || supplierLetter(list[i - 1].name) !== l;
              return <SupplierCard key={s.id} s={s} anchor={first && letters.length > 3 ? `letra-${l}` : undefined} />;
            })}
          </div>
          <p className="text-xs text-muted">{plural(list.length, "fornecedor", "fornecedores")}{archived ? (list.length === 1 ? " arquivado" : " arquivados") : ""}.</p>
        </div>
      )}
    </div>
  );
}

function SupplierCard({ s, anchor }: { anchor?: string; s: { id: string; name: string; category: string | null; contactName: string | null; phone: string | null; email: string | null; rating: number | null; quotes: { status: string; amountCents: number; createdAt: Date }[] } }) {
  const wa = whatsappNumber(s.phone);
  const approved = s.quotes.filter((x) => x.status === "approved");
  const waiting = s.quotes.filter((x) => x.status === "pending").length;
  const last = s.quotes.reduce<Date | null>((d, x) => (!d || x.createdAt > d ? x.createdAt : d), null);
  return (
    <Card id={anchor} className="flex scroll-mt-24 flex-col p-4 transition hover:border-line-strong">
      <Link href={`/fornecedores/${s.id}`} className="group flex items-start gap-3">
        <CategoryIcon category={s.category} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium group-hover:text-brand">{s.name}</p>
          <p className="truncate text-xs text-muted">{[s.category, s.contactName].filter(Boolean).join(" · ") || "Sem ramo"}</p>
          <Stars value={s.rating} size="size-3" />
        </div>
      </Link>
      <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
        {approved.length > 0 && <span className="rounded-full bg-ok/10 px-2 py-0.5 font-medium text-ok">{fmtBRL(approved.reduce((n, x) => n + x.amountCents, 0))} aprovados</span>}
        {waiting > 0 && <span className="rounded-full bg-warn/10 px-2 py-0.5 font-medium text-warn">{plural(waiting, "aguardando", "aguardando")}</span>}
        {last ? <span className="rounded-full bg-bg-2 px-2 py-0.5 text-muted">último orçamento {fmtRelative(last)}</span> : <span className="rounded-full bg-bg-2 px-2 py-0.5 text-muted">sem orçamentos</span>}
      </div>
      <div className="mt-auto flex items-center gap-1.5 pt-3">
        {s.phone && <a href={`tel:${s.phone.replace(/[^\d+]/g, "")}`} title={s.phone} className="inline-flex h-8 min-w-0 items-center gap-1.5 rounded-xl px-2.5 text-xs text-fg-2 ring-1 ring-line hover:bg-bg-2"><Phone className="size-3.5 shrink-0" /><span className="truncate">{s.phone}</span></a>}
        {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" aria-label="WhatsApp" className="grid size-8 shrink-0 place-items-center rounded-xl text-ok ring-1 ring-line hover:bg-ok/10"><MessageCircle className="size-4" /></a>}
        {s.email && <a href={`mailto:${s.email}`} aria-label="E-mail" className="grid size-8 shrink-0 place-items-center rounded-xl text-fg-2 ring-1 ring-line hover:bg-bg-2"><Mail className="size-4" /></a>}
        <Link href={`/fornecedores/orcamento/novo?fornecedor=${s.id}`} className="ml-auto inline-flex h-8 shrink-0 items-center gap-1 rounded-xl px-2.5 text-xs font-medium text-brand ring-1 ring-line hover:bg-bg-2"><Plus className="size-3.5" />Orçamento</Link>
      </div>
    </Card>
  );
}
