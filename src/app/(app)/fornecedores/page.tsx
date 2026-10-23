import type { Metadata } from "next";
import Link from "next/link";
import { Archive, FileText, Handshake, Mail, MessageCircle, Phone, Plus, Scale, Search } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { adminScope } from "@/lib/admin-scope-server";
import { dateToDay, fmtBRL, fmtDayBR } from "@/lib/finance";
import { fmtRelative, nowMs } from "@/lib/format";
import { QUOTE_STATUS, SUPPLIER_ROLES, canDecideQuote, quoteExpired, quoteGroups, quoteStatus, supplierLetter, whatsappNumber, type QuoteStatus } from "@/lib/suppliers";
import { supplierCondo } from "@/lib/suppliers-server";
import { Badge, Card, Empty, LinkButton, PageHeader, cx } from "@/components/ui";
import { Stars } from "./stars";

export const metadata: Metadata = { title: "Fornecedores" };

type SP = Promise<Record<string, string | undefined>>;
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default async function SuppliersPage({ searchParams }: { searchParams: SP }) {
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
  const pendingCount = await db.supplierQuote.count({ where: { condominiumId: condoId, status: "pending" } });
  const tabs = [
    ["orcamentos", "Orçamentos", pendingCount],
    ["agenda", "Agenda de fornecedores", null],
  ] as const;

  return (
    <div className="animate-in">
      <PageHeader
        eyebrow={scope?.name ?? "Fornecedores"}
        title="Fornecedores"
        description={decider ? "Agenda de contatos e orçamentos: o zelador cadastra, você aprova ou recusa." : "Agenda de contatos e orçamentos. O síndico aprova ou recusa cada orçamento."}
        actions={
          <>
            <LinkButton href="/fornecedores/novo" variant="outline"><Plus className="size-4" />Fornecedor</LinkButton>
            <LinkButton href="/fornecedores/orcamento/novo"><Plus className="size-4" />Orçamento</LinkButton>
          </>
        }
      />

      <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-line [scrollbar-width:none]">
        {tabs.map(([k, l, n]) => (
          <Link key={k} href={k === "orcamentos" ? "/fornecedores" : `/fornecedores?aba=${k}`} className={cx("-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition", tab === k ? "border-brand text-brand" : "border-transparent text-muted hover:text-fg")}>
            {l}
            {!!n && <span className="rounded-full bg-warn/15 px-1.5 text-[11px] font-semibold text-warn">{n}</span>}
          </Link>
        ))}
      </nav>

      {tab === "agenda" ? <Agenda condoId={condoId} sp={sp} manage={decider} /> : <Quotes condoId={condoId} sp={sp} decider={decider} pendingCount={pendingCount} />}
    </div>
  );
}

/* ───────────── Orçamentos ───────────── */

async function Quotes({ condoId, sp, decider, pendingCount }: { condoId: string; sp: Record<string, string | undefined>; decider: boolean; pendingCount: number }) {
  const status = (sp.status && (sp.status in QUOTE_STATUS || sp.status === "todos") ? sp.status : pendingCount ? "pending" : "todos") as QuoteStatus | "todos";
  const today = dateToDay(new Date(nowMs()));
  const yearStart = new Date(`${today.slice(0, 4)}-01-01T00:00:00-03:00`);

  const [quotes, counts, approvedYear, open] = await Promise.all([
    db.supplierQuote.findMany({
      where: { condominiumId: condoId, ...(status !== "todos" && { status }) },
      include: { supplier: { select: { id: true, name: true } }, _count: { select: { files: true } } },
      orderBy: status === "pending" ? { createdAt: "asc" } : { createdAt: "desc" },
      take: 100,
    }),
    db.supplierQuote.groupBy({ by: ["status"], where: { condominiumId: condoId }, _count: true }),
    db.supplierQuote.aggregate({ where: { condominiumId: condoId, status: "approved", decidedAt: { gte: yearStart } }, _sum: { amountCents: true }, _count: true }),
    // Para comparar: tudo que aguarda ou foi aprovado (os grupos só aparecem com algum aguardando)
    db.supplierQuote.findMany({ where: { condominiumId: condoId, status: { in: ["pending", "approved"] } }, include: { supplier: { select: { name: true } } } }),
  ]);
  const countOf = (s: string) => counts.find((c) => c.status === s)?._count ?? 0;
  const total = counts.reduce((n, c) => n + c._count, 0);
  const groups = quoteGroups(open);

  const filters: [string, string, number][] = [
    ["pending", "Aguardando", countOf("pending")],
    ["approved", "Aprovados", countOf("approved")],
    ["rejected", "Recusados", countOf("rejected")],
    ["cancelled", "Cancelados", countOf("cancelled")],
    ["todos", "Todos", total],
  ];

  if (!total) {
    return (
      <Card>
        <Empty icon={<FileText className="size-8" />} title="Nenhum orçamento ainda">
          Cadastre o orçamento de um fornecedor com o PDF ou a foto. {decider ? "Você decide aqui mesmo." : "O síndico recebe o aviso para aprovar."}
          <span className="mt-4 flex justify-center"><LinkButton href="/fornecedores/orcamento/novo"><Plus className="size-4" />Cadastrar orçamento</LinkButton></span>
        </Empty>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <MiniStat label={decider ? "Aguardando sua decisão" : "Aguardando o síndico"} value={String(countOf("pending"))} tone={countOf("pending") ? "warn" : undefined} />
        <MiniStat label={`Aprovados em ${today.slice(0, 4)}`} value={fmtBRL(approvedYear._sum.amountCents ?? 0)} hint={`${approvedYear._count} orçamento${approvedYear._count === 1 ? "" : "s"}`} />
        <MiniStat className="max-sm:hidden" label="Para comparar" value={String(groups.length)} hint={groups.length ? "serviços com 2 ou mais orçamentos" : "nenhum serviço com mais de um orçamento"} />
      </div>

      {groups.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Scale className="size-4 text-brand" />Comparar orçamentos do mesmo serviço</h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {groups.map((g) => (
              <Card key={g.title} className="p-4">
                <p className="font-medium">{g.title}</p>
                <p className="mb-3 text-xs text-muted">{g.quotes.length} orçamentos · {g.spread ? `diferença de ${fmtBRL(g.spread)} entre o mais barato e o mais caro` : "todos com o mesmo valor"}</p>
                <div className="space-y-1.5">
                  {g.quotes.map((q) => (
                    <Link key={q.id} href={`/fornecedores/orcamento/${q.id}`} className={cx("flex items-center gap-2 rounded-xl px-3 py-2 text-sm ring-1 transition hover:bg-bg-2", g.spread && q.id === g.cheapestId ? "ring-ok/40" : "ring-line")}>
                      <span className="min-w-0 flex-1 truncate">{q.supplier.name}</span>
                      {g.spread > 0 && q.id === g.cheapestId && <Badge tone="ok">menor preço</Badge>}
                      {q.status === "approved" && <Badge tone="ok" dot>aprovado</Badge>}
                      <span className="shrink-0 font-semibold tabular-nums">{fmtBRL(q.amountCents)}</span>
                    </Link>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {filters.map(([k, l, n]) => (
            <Link key={k} href={`/fornecedores?status=${k}`} className={cx("rounded-full px-3 py-1 text-xs font-medium ring-1 transition", status === k ? "bg-brand-soft text-brand ring-brand" : "text-fg-2 ring-line-strong hover:bg-bg-2")}>
              {l} <span className="text-muted">{n}</span>
            </Link>
          ))}
        </div>
        {!quotes.length ? (
          <p className="rounded-2xl bg-bg-2 px-4 py-6 text-center text-sm text-muted">Nada aqui.</p>
        ) : (
          <Card className="divide-y divide-line">
            {quotes.map((q) => {
              const st = quoteStatus(q.status);
              const expired = q.status === "pending" && quoteExpired(q.validUntil ? dateToDay(q.validUntil) : null, today);
              return (
                <Link key={q.id} href={`/fornecedores/orcamento/${q.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 transition hover:bg-bg-2 sm:flex-nowrap">
                  <div className="min-w-0 flex-1 max-sm:basis-full">
                    <p className="truncate text-sm font-medium">{q.title}</p>
                    <p className="truncate text-xs text-muted">
                      {q.supplier.name} · por {q.createdByName} {fmtRelative(q.createdAt)}
                      {q._count.files > 0 && ` · ${q._count.files} arquivo${q._count.files > 1 ? "s" : ""}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 max-sm:w-full max-sm:justify-end">
                    {expired && <Badge tone="bad">validade vencida</Badge>}
                    {!expired && q.status === "pending" && q.validUntil && <span className="text-xs text-muted">válido até {fmtDayBR(q.validUntil)}</span>}
                    <Badge tone={st.tone} dot>{st.short}</Badge>
                    <span className="w-28 text-right text-sm font-semibold tabular-nums">{fmtBRL(q.amountCents)}</span>
                  </div>
                </Link>
              );
            })}
          </Card>
        )}
      </section>
    </div>
  );
}

function MiniStat({ label, value, hint, tone, className }: { label: string; value: string; hint?: string; tone?: "warn"; className?: string }) {
  return (
    <Card className={cx("min-w-0 p-4", className)}>
      <p className="text-xs text-muted">{label}</p>
      <p className={cx("mt-1 truncate font-display text-lg font-semibold tabular-nums sm:text-xl", tone === "warn" && "text-warn")}>{value}</p>
      {hint && <p className="text-[11px] text-muted">{hint}</p>}
    </Card>
  );
}

/* ───────────── Agenda ───────────── */

async function Agenda({ condoId, sp, manage }: { condoId: string; sp: Record<string, string | undefined>; manage: boolean }) {
  const q = (sp.q ?? "").trim();
  const ramo = sp.ramo ?? "";
  const archived = manage && sp.arquivados === "1";
  const all = await db.supplier.findMany({
    where: { condominiumId: condoId, archivedAt: archived ? { not: null } : null },
    include: { quotes: { select: { status: true, amountCents: true } } },
    orderBy: { name: "asc" },
  });
  const categories = [...new Set(all.map((s) => s.category).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const w = norm(q);
  const list = all
    .filter((s) => (!ramo || s.category === ramo) && (!w || norm([s.name, s.category, s.contactName, s.phone, s.email, s.notes].filter(Boolean).join(" ")).includes(w)))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));
  const byLetter = new Map<string, typeof list>();
  for (const s of list) byLetter.set(supplierLetter(s.name), [...(byLetter.get(supplierLetter(s.name)) ?? []), s]);
  const letters = [...byLetter.keys()].sort((a, b) => (a === "#" ? 1 : b === "#" ? -1 : a.localeCompare(b)));
  const qs = (extra: Record<string, string>) => {
    const p = new URLSearchParams({ aba: "agenda", ...(q && { q }), ...(ramo && { ramo }), ...(archived && { arquivados: "1" }), ...extra });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    return `/fornecedores?${p}`;
  };

  return (
    <div className="space-y-4">
      <form className="flex flex-wrap gap-2" action="/fornecedores">
        <input type="hidden" name="aba" value="agenda" />
        {archived && <input type="hidden" name="arquivados" value="1" />}
        <label className="relative min-w-0 flex-1 basis-60">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input name="q" defaultValue={q} placeholder="Buscar por nome, ramo, contato ou telefone" className="h-10 w-full rounded-xl border border-line-strong bg-surface pl-9 pr-3 text-sm text-fg shadow-card placeholder:text-muted/70 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15" />
        </label>
        {categories.length > 0 && (
          <select name="ramo" defaultValue={ramo} className="h-10 rounded-xl border border-line-strong bg-surface px-3 text-sm text-fg shadow-card">
            <option value="">Todos os ramos</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <button className="h-10 rounded-xl px-4 text-sm font-medium ring-1 ring-line-strong hover:bg-bg-2">Buscar</button>
        {manage && (
          <Link href={qs({ arquivados: archived ? "" : "1" })} className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm text-muted hover:bg-bg-2 hover:text-fg">
            <Archive className="size-4" />{archived ? "Ver ativos" : "Arquivados"}
          </Link>
        )}
      </form>

      {letters.length > 1 && (
        <div className="flex flex-wrap gap-1">
          {letters.map((l) => <a key={l} href={`#letra-${l}`} className="grid size-7 place-items-center rounded-lg text-xs font-semibold text-fg-2 ring-1 ring-line hover:bg-bg-2 hover:text-brand">{l}</a>)}
        </div>
      )}

      {!list.length ? (
        <Card>
          <Empty icon={<Handshake className="size-8" />} title={all.length ? "Nenhum fornecedor encontrado" : archived ? "Nenhum fornecedor arquivado" : "Nenhum fornecedor cadastrado"}>
            {all.length ? "Tente outra busca ou outro ramo." : !archived && (
              <>Cadastre quem presta serviço ou vende material para o condomínio: fica tudo num lugar só, com telefone, WhatsApp e orçamentos.
                <span className="mt-4 flex justify-center"><LinkButton href="/fornecedores/novo"><Plus className="size-4" />Cadastrar fornecedor</LinkButton></span>
              </>
            )}
          </Empty>
        </Card>
      ) : (
        <div className="space-y-5">
          {letters.map((l) => (
            <section key={l} id={`letra-${l}`} className="scroll-mt-24">
              <h2 className="mb-2 font-display text-sm font-semibold text-muted">{l}</h2>
              <Card className="divide-y divide-line">
                {byLetter.get(l)!.map((s) => {
                  const wa = whatsappNumber(s.phone);
                  const approved = s.quotes.filter((x) => x.status === "approved");
                  const waiting = s.quotes.filter((x) => x.status === "pending").length;
                  return (
                    <div key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:flex-nowrap">
                      <Link href={`/fornecedores/${s.id}`} className="min-w-0 flex-1 basis-56 hover:text-brand">
                        <p className="flex items-center gap-2 truncate text-sm font-medium">{s.name}<Stars value={s.rating} size="size-3" /></p>
                        <p className="truncate text-xs text-muted">
                          {[s.category, s.contactName, approved.length && `${approved.length} aprovado${approved.length > 1 ? "s" : ""}`, waiting && `${waiting} aguardando`].filter(Boolean).join(" · ") || "Sem ramo"}
                        </p>
                      </Link>
                      <div className="flex shrink-0 items-center gap-1">
                        {s.phone && <a href={`tel:${s.phone.replace(/[^\d+]/g, "")}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs text-fg-2 ring-1 ring-line hover:bg-bg-2"><Phone className="size-3.5" />{s.phone}</a>}
                        {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" aria-label="WhatsApp" className="grid size-8 place-items-center rounded-lg text-ok ring-1 ring-line hover:bg-ok/10"><MessageCircle className="size-4" /></a>}
                        {s.email && <a href={`mailto:${s.email}`} aria-label="E-mail" className="grid size-8 place-items-center rounded-lg text-fg-2 ring-1 ring-line hover:bg-bg-2"><Mail className="size-4" /></a>}
                        <Link href={`/fornecedores/orcamento/novo?fornecedor=${s.id}`} className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-brand ring-1 ring-line hover:bg-bg-2"><Plus className="size-3.5" />Orçamento</Link>
                      </div>
                    </div>
                  );
                })}
              </Card>
            </section>
          ))}
          <p className="text-xs text-muted">{list.length} fornecedor{list.length === 1 ? "" : "es"}{archived ? " arquivado" + (list.length === 1 ? "" : "s") : ""}.</p>
        </div>
      )}
    </div>
  );
}
