import type { Metadata } from "next";
import Link from "next/link";
import { Archive, ArrowRight, CheckCircle2, FileText, Handshake, Hourglass, Mail, MessageCircle, Paperclip, Phone, Plus, Scale, Search, XCircle } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { adminScope } from "@/lib/admin-scope-server";
import { dateToDay, fmtBRL } from "@/lib/finance";
import { fmtRelative, nowMs } from "@/lib/format";
import {
  QUOTE_STATUS, SUPPLIER_ROLES, canDecideQuote, priceDiff, quoteGroups, quoteStatus, supplierLetter, validityLabel, whatsappNumber, type QuoteStatus,
} from "@/lib/suppliers";
import { supplierCondo } from "@/lib/suppliers-server";
import { Badge, Card, Empty, LinkButton, PageHeader, cx, type Tone } from "@/components/ui";
import { CategoryIcon } from "@/components/suppliers/look";
import { Stars } from "./stars";
import { QuickQuote } from "./quick-quote";
import { usedQuoteTitles } from "./options";

export const metadata: Metadata = { title: "Fornecedores" };

type SP = Record<string, string | undefined>;
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser(...SUPPLIER_ROLES);
  const sp = await searchParams;
  const scope = await adminScope(user);
  const condoId = await supplierCondo(user);
  const tab = sp.aba === "agenda" ? "agenda" : "orcamentos";

  if (!condoId) {
    return (
      <div className="animate-in">
        <PageHeader eyebrow="Fornecedores" title="Fornecedores" />
        <Card><Empty icon={<Handshake className="size-8" />} title="Escolha um condomínio">Use o cartão do condomínio no menu para ver os fornecedores e orçamentos dele.</Empty></Card>
      </div>
    );
  }

  const decider = canDecideQuote(user.role);
  const [pendingCount, supplierCount, pickable, titles] = await Promise.all([
    db.supplierQuote.count({ where: { condominiumId: condoId, status: "pending" } }),
    db.supplier.count({ where: { condominiumId: condoId, archivedAt: null } }),
    db.supplier.findMany({ where: { condominiumId: condoId, archivedAt: null }, select: { id: true, name: true, category: true }, orderBy: { name: "asc" } }),
    usedQuoteTitles(condoId),
  ]);
  const tabs = [
    ["orcamentos", "Orçamentos", pendingCount, "warn"],
    ["agenda", "Agenda de fornecedores", supplierCount, "muted"],
  ] as const;

  return (
    <div className="animate-in">
      <PageHeader
        eyebrow={scope?.name ?? "Fornecedores"}
        title="Fornecedores"
        description={decider ? "Agenda de contatos e orçamentos: o zelador cadastra, você compara e decide." : "Agenda de contatos e orçamentos. Arraste o PDF para a página para cadastrar um orçamento."}
        actions={
          <>
            <LinkButton href="/fornecedores/novo" variant="outline"><Plus className="size-4" />Fornecedor</LinkButton>
            <QuickQuote suppliers={pickable} titles={titles} />
          </>
        }
      />

      <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-line [scrollbar-width:none]">
        {tabs.map(([k, l, n, tone]) => (
          <Link key={k} href={k === "orcamentos" ? "/fornecedores" : `/fornecedores?aba=${k}`} className={cx("-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition", tab === k ? "border-brand text-brand" : "border-transparent text-muted hover:text-fg")}>
            {l}
            {!!n && <span className={cx("rounded-full px-1.5 text-[11px] font-semibold", tone === "warn" ? "bg-warn/15 text-warn" : "bg-bg-2 text-muted")}>{n}</span>}
          </Link>
        ))}
      </nav>

      {tab === "agenda" ? <Agenda condoId={condoId} sp={sp} manage={decider} /> : <Quotes condoId={condoId} sp={sp} decider={decider} />}
    </div>
  );
}

/* ───────────── Orçamentos ───────────── */

type QuoteCardData = {
  id: string; title: string; amountCents: number; status: string; createdAt: Date; createdByName: string; validUntil: Date | null;
  decisionNote: string | null; decidedByName: string | null; supplier: { name: string; category: string | null }; _count: { files: number };
};

async function Quotes({ condoId, sp, decider }: { condoId: string; sp: SP; decider: boolean }) {
  const today = dateToDay(new Date(nowMs()));
  const yearStart = new Date(`${today.slice(0, 4)}-01-01T00:00:00-03:00`);
  const include = { supplier: { select: { name: true, category: true } }, _count: { select: { files: true } } } as const;
  const listStatus = sp.status && (sp.status in QUOTE_STATUS || sp.status === "todos") ? (sp.status as QuoteStatus | "todos") : null;

  const [pending, approved, closed, counts, approvedYear, list] = await Promise.all([
    db.supplierQuote.findMany({ where: { condominiumId: condoId, status: "pending" }, include, orderBy: { createdAt: "asc" } }),
    db.supplierQuote.findMany({ where: { condominiumId: condoId, status: "approved" }, include, orderBy: { decidedAt: "desc" }, take: 6 }),
    db.supplierQuote.findMany({ where: { condominiumId: condoId, status: { in: ["rejected", "cancelled"] } }, include, orderBy: { decidedAt: "desc" }, take: 4 }),
    db.supplierQuote.groupBy({ by: ["status"], where: { condominiumId: condoId }, _count: true }),
    db.supplierQuote.aggregate({ where: { condominiumId: condoId, status: "approved", decidedAt: { gte: yearStart } }, _sum: { amountCents: true }, _count: true }),
    listStatus
      ? db.supplierQuote.findMany({ where: { condominiumId: condoId, ...(listStatus !== "todos" && { status: listStatus }) }, include, orderBy: { createdAt: "desc" }, take: 200 })
      : Promise.resolve(null),
  ]);
  const countOf = (s: string) => counts.find((c) => c.status === s)?._count ?? 0;
  const total = counts.reduce((n, c) => n + c._count, 0);
  // Comparação: o que aguarda + os aprovados do mesmo serviço
  const groups = quoteGroups([...pending, ...(await db.supplierQuote.findMany({ where: { condominiumId: condoId, status: "approved" }, include }))]);

  if (!total) {
    return (
      <Card className="overflow-hidden">
        <div className="grid gap-6 p-8 sm:grid-cols-[auto_1fr] sm:items-center">
          <span className="mx-auto grid size-20 place-items-center rounded-3xl bg-brand/10 text-brand"><FileText className="size-9" /></span>
          <div className="text-center sm:text-left">
            <p className="font-display text-xl font-semibold">Nenhum orçamento ainda</p>
            <p className="mt-1 text-sm text-muted">Clique em <b>Orçamento</b> ou simplesmente <b>arraste o PDF</b> do fornecedor para esta página. {decider ? "Você compara e decide aqui mesmo." : "O síndico recebe o aviso para decidir."}</p>
          </div>
        </div>
        <div className="grid border-t border-line text-center text-xs text-muted sm:grid-cols-3">
          {[["1", "Cadastre o orçamento com o arquivo"], ["2", "Peça outros do mesmo serviço"], ["3", "O síndico compara e escolhe"]].map(([n, t]) => (
            <p key={n} className="flex items-center justify-center gap-2 px-4 py-3 max-sm:border-t max-sm:border-line sm:border-l sm:first:border-l-0"><span className="grid size-5 place-items-center rounded-full bg-bg-2 text-[11px] font-semibold text-fg-2">{n}</span>{t}</p>
          ))}
        </div>
      </Card>
    );
  }

  const kpis: { label: string; value: string; hint: string; icon: typeof Hourglass; tone: Tone; href: string }[] = [
    { label: decider ? "Esperando sua decisão" : "Esperando o síndico", value: String(countOf("pending")), hint: countOf("pending") ? `mais antigo ${fmtRelative(pending[0].createdAt)}` : "nada pendente", icon: Hourglass, tone: countOf("pending") ? "warn" : "muted", href: "/fornecedores?status=pending" },
    { label: `Aprovado em ${today.slice(0, 4)}`, value: fmtBRL(approvedYear._sum.amountCents ?? 0), hint: plural(approvedYear._count, "orçamento", "orçamentos"), icon: CheckCircle2, tone: "ok", href: "/fornecedores?status=approved" },
    { label: "Serviços para comparar", value: String(groups.length), hint: groups.length ? "com 2 ou mais orçamentos" : "peça mais de um orçamento", icon: Scale, tone: "brand", href: "#comparar" },
  ];

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {kpis.map((k, i) => (
          <Link key={k.label} href={k.href} className={cx("group rounded-2xl border bg-surface p-4 shadow-card transition hover:border-line-strong", i === 2 && "max-lg:col-span-2")}>
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs text-muted">{k.label}</p>
              <span className={cx("grid size-8 place-items-center rounded-xl", { warn: "bg-warn/10 text-warn", ok: "bg-ok/10 text-ok", brand: "bg-brand/10 text-brand", muted: "bg-bg-2 text-muted", info: "bg-info/10 text-info", bad: "bg-bad/10 text-bad" }[k.tone])}><k.icon className="size-4" /></span>
            </div>
            <p className="mt-1 truncate font-display text-lg font-semibold tabular-nums sm:text-2xl">{k.value}</p>
            <p className="truncate text-[11px] text-muted">{k.hint}</p>
          </Link>
        ))}
      </div>

      {list ? (
        <QuoteList quotes={list} status={listStatus!} counts={{ pending: countOf("pending"), approved: countOf("approved"), rejected: countOf("rejected"), cancelled: countOf("cancelled"), todos: total }} today={today} />
      ) : (
        <>
          {groups.length > 0 && (
            <section id="comparar" className="scroll-mt-24">
              <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold"><Scale className="size-5 text-brand" />Comparar antes de decidir</h2>
              <div className="grid gap-3 lg:grid-cols-2">
                {groups.map((g) => {
                  const max = g.quotes[g.quotes.length - 1].amountCents;
                  const min = g.quotes[0].amountCents;
                  return (
                    <Card key={g.title} className="p-4">
                      <div className="mb-3 flex items-start gap-3">
                        <CategoryIcon category={g.quotes[0].supplier.category} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{g.title}</p>
                          <p className="text-xs text-muted">{g.quotes.length} orçamentos · {g.spread ? `economia de até ${fmtBRL(g.spread)}` : "todos com o mesmo valor"}</p>
                        </div>
                      </div>
                      <div className="space-y-2">
                        {g.quotes.map((q) => {
                          const best = g.spread > 0 && q.id === g.cheapestId;
                          const diff = priceDiff(q.amountCents, min);
                          return (
                            <Link key={q.id} href={`/fornecedores/orcamento/${q.id}`} className="group block">
                              <div className="mb-0.5 flex items-center gap-2 text-xs">
                                <span className="min-w-0 flex-1 truncate font-medium text-fg-2 group-hover:text-brand">{q.supplier.name}</span>
                                {q.status === "approved" && <Badge tone="ok" dot>aprovado</Badge>}
                                {best && <Badge tone="ok">menor preço</Badge>}
                                {diff && <span className="text-muted">{diff}</span>}
                                <span className="w-24 shrink-0 text-right font-semibold tabular-nums text-fg">{fmtBRL(q.amountCents)}</span>
                              </div>
                              <div className="h-2 overflow-hidden rounded-full bg-bg-2">
                                <div className={cx("h-full rounded-full transition-all", best ? "bg-ok" : "bg-brand/50 group-hover:bg-brand/70")} style={{ width: `${Math.max(8, (q.amountCents / max) * 100)}%` }} />
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                      <Link href={`/fornecedores/comparar?servico=${encodeURIComponent(g.title)}`} className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline">
                        Comparar lado a lado{decider && " e escolher"}<ArrowRight className="size-4" />
                      </Link>
                    </Card>
                  );
                })}
              </div>
            </section>
          )}

          <section className="grid gap-5 lg:grid-cols-3">
            <Column title={decider ? "Para você decidir" : "Esperando o síndico"} icon={Hourglass} tone="warn" count={countOf("pending")} href="/fornecedores?status=pending" empty="Nada esperando decisão.">
              {pending.map((q) => <QuoteCard key={q.id} q={q} today={today} />)}
            </Column>
            <Column title="Aprovados" icon={CheckCircle2} tone="ok" count={countOf("approved")} href="/fornecedores?status=approved" empty="Nenhum aprovado ainda." more={countOf("approved") - approved.length}>
              {approved.map((q) => <QuoteCard key={q.id} q={q} today={today} />)}
            </Column>
            <Column title="Recusados e cancelados" icon={XCircle} tone="muted" count={countOf("rejected") + countOf("cancelled")} href="/fornecedores?status=rejected" empty="Nenhum recusado." more={countOf("rejected") + countOf("cancelled") - closed.length}>
              {closed.map((q) => <QuoteCard key={q.id} q={q} today={today} />)}
            </Column>
          </section>
        </>
      )}
    </div>
  );
}

function Column({ title, icon: Icon, tone, count, href, empty, more = 0, children }: { title: string; icon: typeof Hourglass; tone: "warn" | "ok" | "muted"; count: number; href: string; empty: string; more?: number; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-3xl bg-bg-2/60 p-3">
      <div className="mb-3 flex items-center gap-2 px-1">
        <Icon className={cx("size-4", { warn: "text-warn", ok: "text-ok", muted: "text-muted" }[tone])} />
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="rounded-full bg-surface px-2 text-xs font-semibold text-muted ring-1 ring-line">{count}</span>
        <Link href={href} className="ml-auto text-xs font-medium text-brand hover:underline">Ver lista</Link>
      </div>
      <div className="space-y-2">
        {count ? children : <p className="rounded-2xl border border-dashed border-line-strong px-4 py-6 text-center text-xs text-muted">{empty}</p>}
        {more > 0 && <Link href={href} className="block rounded-xl py-2 text-center text-xs font-medium text-brand hover:bg-surface">Mais {more}</Link>}
      </div>
    </div>
  );
}

function QuoteCard({ q, today }: { q: QuoteCardData; today: string }) {
  const st = quoteStatus(q.status);
  const validity = q.status === "pending" ? validityLabel(q.validUntil ? dateToDay(q.validUntil) : null, today) : null;
  return (
    <Link href={`/fornecedores/orcamento/${q.id}`} className="block rounded-2xl border bg-surface p-3.5 shadow-card transition hover:-translate-y-0.5 hover:border-line-strong hover:shadow-pop">
      <div className="flex items-start gap-3">
        <CategoryIcon category={q.supplier.category} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{q.title}</p>
          <p className="truncate text-xs text-muted">{q.supplier.name}</p>
        </div>
      </div>
      <div className="mt-3 flex items-end justify-between gap-2">
        <p className="font-display text-lg font-semibold tabular-nums">{fmtBRL(q.amountCents)}</p>
        {q.status !== "pending" && <Badge tone={st.tone} dot>{st.short}</Badge>}
      </div>
      {q.decisionNote && q.status !== "pending" && <p className="mt-2 line-clamp-2 rounded-xl bg-bg-2 px-2.5 py-1.5 text-xs text-fg-2">“{q.decisionNote}”</p>}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
        {validity && <span className={cx(validity.tone === "bad" && "font-medium text-bad", validity.tone === "warn" && "font-medium text-warn")}>{validity.text}</span>}
        <span>{q.createdByName.split(" ")[0]} · {fmtRelative(q.createdAt)}</span>
        {q._count.files > 0 && <span className="inline-flex items-center gap-0.5"><Paperclip className="size-3" />{q._count.files}</span>}
      </div>
    </Link>
  );
}

function QuoteList({ quotes, status, counts, today }: { quotes: QuoteCardData[]; status: QuoteStatus | "todos"; counts: Record<string, number>; today: string }) {
  const filters: [string, string][] = [["pending", "Aguardando"], ["approved", "Aprovados"], ["rejected", "Recusados"], ["cancelled", "Cancelados"], ["todos", "Todos"]];
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <Link href="/fornecedores" className="mr-1 text-xs font-medium text-brand hover:underline">← Quadro</Link>
        {filters.map(([k, l]) => (
          <Link key={k} href={`/fornecedores?status=${k}`} className={cx("rounded-full px-3 py-1 text-xs font-medium ring-1 transition", status === k ? "bg-brand-soft text-brand ring-brand" : "text-fg-2 ring-line-strong hover:bg-bg-2")}>
            {l} <span className="text-muted">{counts[k]}</span>
          </Link>
        ))}
      </div>
      {!quotes.length ? (
        <p className="rounded-2xl bg-bg-2 px-4 py-6 text-center text-sm text-muted">Nada aqui.</p>
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
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
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
