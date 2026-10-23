import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck, CheckCircle2, Clock, MapPin, Sparkles, Star, Timer, Wrench } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { adminScope } from "@/lib/admin-scope-server";
import { feedInclude, type FeedItem } from "@/components/feed-card";
import { CategoryChip, ServiceCard, Stars, mediaOf, summary } from "@/components/service-card";
import { BeforeAfter } from "@/components/before-after";
import { Avatar, Card, Empty, PageHeader, Select, buttonClass, cx } from "@/components/ui";
import { Pager, pageParam, withPage } from "@/components/frozen";
import { categoryIcon } from "@/lib/category-icons";
import { DELETED_USER, fmtDate, fmtRelative, nowMs } from "@/lib/format";
import { locationLabel } from "@/lib/orders";
import { FEED_PERIODS, averageDays, averageRating, monthOf, periodStart, type FeedPeriod } from "@/lib/feed";

export const metadata: Metadata = { title: "Serviços do prédio" };

const PAGE = 13; // o destaque + 12 cartões (quatro linhas de três)

export default async function FeedPage({ searchParams }: PageProps<"/feed">) {
  const user = await requireUser("superadmin", "syndic", "caretaker", "council", "resident");
  const sp = await searchParams;
  const admin = user.role === "superadmin";
  // Superadmin vê todos os condomínios (com filtro); os demais, só o próprio
  const condos = admin ? await db.condominium.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [];
  // Filtro da página; sem filtro, vale o condomínio em foco do menu ("" = todos)
  const scope = admin && sp.condo === undefined ? await adminScope(user) : null;
  const condo = admin ? (typeof sp.condo === "string" && condos.some((c) => c.id === sp.condo) ? sp.condo : scope?.id ?? null) : null;
  const period: FeedPeriod = typeof sp.periodo === "string" && sp.periodo in FEED_PERIODS ? (sp.periodo as FeedPeriod) : "ano";
  const catParam = typeof sp.cat === "string" ? sp.cat : "";
  const since = periodStart(period, nowMs());

  const base = {
    status: "approved",
    ...(admin ? (condo ? { condominiumId: condo } : { condominium: { deletedAt: null } }) : { condominiumId: user.condominiumId! }),
    ...(since && { approvedAt: { gte: since } }),
  };
  // Números e categorias do período inteiro; a lista respeita a categoria escolhida
  const [stats, byCat] = await Promise.all([
    db.serviceOrder.findMany({ where: base, select: { createdAt: true, approvedAt: true, executionMinutes: true, rating: true } }),
    db.serviceOrder.groupBy({ by: ["categoryId"], where: base, _count: true }),
  ]);
  const cats = byCat.length ? await db.serviceCategory.findMany({ where: { id: { in: byCat.map((c) => c.categoryId).filter((x): x is string => !!x) } } }) : [];
  const catList = byCat
    .map((c) => ({ id: c.categoryId ?? "sem", count: c._count, cat: cats.find((x) => x.id === c.categoryId) ?? null }))
    .sort((a, b) => b.count - a.count);
  const where = { ...base, ...(catParam && { categoryId: catParam === "sem" ? null : catParam }) };
  const total = await db.serviceOrder.count({ where });
  const page = pageParam(sp.page, total, PAGE);
  const items = await db.serviceOrder.findMany({ where, include: feedInclude, orderBy: { approvedAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE });

  // Destaque: o mais recente com antes e depois em foto (só na primeira página)
  const featured = page === 1 ? items.find((o) => { const m = mediaOf(o); return m.before?.type === "photo" && m.after?.type === "photo"; }) : undefined;
  const rest = items.filter((o) => o !== featured);
  const months: { key: string; label: string; list: FeedItem[] }[] = [];
  for (const o of rest) {
    const m = monthOf(o.approvedAt ?? o.updatedAt);
    const last = months[months.length - 1];
    if (last?.key === m.key) last.list.push(o);
    else months.push({ ...m, list: [o] });
  }

  const minutes = stats.reduce((n, o) => n + (o.executionMinutes ?? 0), 0);
  const avgDays = averageDays(stats);
  const avgRating = averageRating(stats);
  const href = (extra: Record<string, string>) => {
    const p = new URLSearchParams({ ...(condo && admin && { condo }), ...(period !== "ano" && { periodo: period }), ...(catParam && { cat: catParam }), ...extra });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    const q = p.toString();
    return q ? `/feed?${q}` : "/feed";
  };
  const showCondo = admin && !condo;

  return (
    <div className="mx-auto max-w-6xl animate-in">
      <PageHeader
        eyebrow="Transparência"
        title="Serviços realizados"
        description={admin ? "Serviços entregues em todos os condomínios, com antes e depois, quem executou e quem aprovou." : "Tudo o que foi feito no condomínio, com o antes e o depois, quem executou, quanto tempo levou e quem aprovou."}
      />

      {admin && (
        <form className="mb-4 flex gap-2">
          <Select name="condo" defaultValue={condo ?? ""} className="flex-1">
            <option value="">Todos os condomínios</option>
            {condos.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <input type="hidden" name="periodo" value={period} />
          <button className={buttonClass("outline")}>Filtrar</button>
        </form>
      )}

      {/* Números do período */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Serviços entregues", value: String(stats.length), hint: FEED_PERIODS[period].toLowerCase(), icon: CalendarCheck, tone: "bg-brand/10 text-brand" },
          { label: "Da abertura à entrega", value: avgDays === null ? "—" : `${String(avgDays).replace(".", ",")} dia${avgDays === 1 ? "" : "s"}`, hint: "em média", icon: Timer, tone: "bg-info/10 text-info" },
          { label: "Horas de trabalho", value: minutes ? `${Math.round(minutes / 60)} h` : "—", hint: "registradas pelos prestadores", icon: Clock, tone: "bg-warn/10 text-warn" },
          { label: "Avaliação média", value: avgRating === null ? "—" : `${String(avgRating).replace(".", ",")} / 5`, hint: `${stats.filter((o) => o.rating).length} avaliações`, icon: Star, tone: "bg-ok/10 text-ok" },
        ].map((k) => (
          <div key={k.label} className="min-w-0 rounded-2xl border border-line bg-surface p-4 shadow-card">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs text-muted">{k.label}</p>
              <span className={cx("grid size-8 shrink-0 place-items-center rounded-xl", k.tone)}><k.icon className="size-4" /></span>
            </div>
            <p className="mt-1 truncate font-display text-lg font-semibold tabular-nums sm:text-2xl">{k.value}</p>
            <p className="truncate text-[11px] text-muted">{k.hint}</p>
          </div>
        ))}
      </div>

      {/* Período e categorias */}
      <div className="mb-6 space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(FEED_PERIODS) as FeedPeriod[]).map((p) => (
            <Link key={p} href={href({ periodo: p === "ano" ? "" : p, cat: "", page: "" })} className={cx("rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition", period === p ? "bg-brand-soft text-brand ring-brand" : "text-fg-2 ring-line-strong hover:bg-bg-2")}>{FEED_PERIODS[p]}</Link>
          ))}
        </div>
        {catList.length > 1 && (
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 py-1 [scrollbar-width:none] sm:-mx-1 sm:flex-wrap sm:px-1">
            <Link href={href({ cat: "", page: "" })} className={cx("inline-flex shrink-0 items-center gap-2 rounded-2xl py-1.5 pl-1.5 pr-3 text-sm ring-1 transition", !catParam ? "bg-brand-soft text-brand ring-brand" : "bg-surface text-fg-2 ring-line hover:ring-line-strong")}>
              <span className="grid size-7 place-items-center rounded-xl bg-bg-2 text-xs font-semibold">{stats.length}</span>Todos
            </Link>
            {catList.map(({ id, count, cat }) => {
              const Icon = cat ? categoryIcon(cat.icon) : Wrench;
              return (
                <Link key={id} href={href({ cat: catParam === id ? "" : id, page: "" })} className={cx("inline-flex shrink-0 items-center gap-2 rounded-2xl py-1.5 pl-1.5 pr-3 text-sm ring-1 transition", catParam === id ? "bg-brand-soft text-brand ring-brand" : "bg-surface text-fg-2 ring-line hover:ring-line-strong")}>
                  <span className="grid size-7 place-items-center rounded-xl bg-bg-2" style={cat ? { color: cat.color } : undefined}><Icon className="size-4" /></span>
                  {cat?.name ?? "Sem categoria"}<span className="text-xs text-muted">{count}</span>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {!items.length ? (
        <Card>
          <Empty icon={<Sparkles className="size-8" />} title={stats.length ? "Nenhum serviço nesta categoria" : "Nenhum serviço entregue neste período"}>
            {stats.length ? "Escolha outra categoria ou “Todos”." : period !== "tudo" ? <Link href={href({ periodo: "tudo", cat: "" })} className="font-medium text-brand hover:underline">Ver todos os serviços</Link> : "Quando o síndico aprovar um serviço, ele aparece aqui com o antes e o depois."}
          </Empty>
        </Card>
      ) : (
        <div className="space-y-8">
          {featured && <Featured o={featured} showCondo={showCondo} />}
          {months.map((m) => (
            <section key={m.key}>
              <h2 className="mb-3 flex items-baseline gap-2 font-display text-lg font-semibold">
                {m.label}<span className="text-sm font-normal text-muted">{m.list.length} serviço{m.list.length === 1 ? "" : "s"}{months.length === 1 && page === 1 && featured ? " além do destaque" : ""}</span>
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {m.list.map((o) => <ServiceCard key={o.id} o={o} showCondo={showCondo} />)}
              </div>
            </section>
          ))}
          <Pager page={page} pageSize={PAGE} total={total} href={(p) => withPage("/feed", sp, p)} />
        </div>
      )}
    </div>
  );
}

/** O serviço mais recente com antes e depois: grande, com o comparador deslizante e o resumo completo. */
function Featured({ o, showCondo }: { o: FeedItem; showCondo: boolean }) {
  const { before, after } = mediaOf(o);
  return (
    <Card className="grid overflow-hidden lg:grid-cols-[1.25fr_1fr]">
      <div className="p-3 lg:pr-0">
        <BeforeAfter before={before!.url} after={after!.url} alt={o.title} />
      </div>
      <div className="flex flex-col gap-3 p-5 lg:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-[11px] font-semibold text-brand">Mais recente</span>
          <CategoryChip o={o} />
        </div>
        <Link href={`/os/${o.id}`} className="font-display text-2xl font-semibold leading-snug hover:text-brand">{o.title}</Link>
        <p className="flex items-center gap-1.5 text-xs text-muted"><MapPin className="size-3.5 text-brand" />{locationLabel(o)}{showCondo && ` · ${o.condominium.name}`}</p>
        {(o.serviceReport || o.description) && <p className="line-clamp-4 whitespace-pre-line text-sm text-fg-2">{o.serviceReport || o.description}</p>}
        <div className="flex items-center gap-3 rounded-2xl bg-bg-2/70 p-3">
          <Avatar name={o.assignedTo?.name ?? DELETED_USER} />
          <div className="min-w-0 flex-1 text-sm">
            <p className="truncate font-medium">{o.assignedTo?.name ?? DELETED_USER}{o.assignedTo?.company && <span className="font-normal text-muted"> · {o.assignedTo.company}</span>}</p>
            <p className="truncate text-xs text-muted">{summary(o) || `Entregue ${o.approvedAt ? fmtRelative(o.approvedAt) : ""}`}</p>
          </div>
          <Stars n={o.rating} />
        </div>
        {o.ratingComment && <p className="text-sm italic text-fg-2">“{o.ratingComment}”</p>}
        <p className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-3 text-xs text-muted">
          <span className="flex items-center gap-1.5"><CheckCircle2 className="size-3.5 text-ok" />Validado por {o.validatedBy?.name ?? (o.validatedAt ? DELETED_USER : "—")}</span>
          <span>Aprovado por {o.approvedBy?.name ?? DELETED_USER} em {fmtDate(o.approvedAt)}</span>
        </p>
      </div>
    </Card>
  );
}

