import type { Metadata } from "next";
import Link from "next/link";
import { createElement } from "react";
import { CalendarCheck, CheckCircle2, Clock, ImageOff, MapPin, PlayCircle, Sparkles, Star, Timer, Wrench } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { adminScope } from "@/lib/admin-scope-server";
import { feedInclude, type FeedItem } from "@/components/feed-card";
import { BeforeAfter } from "@/components/before-after";
import { Avatar, Card, Empty, PageHeader, Select, buttonClass, cx } from "@/components/ui";
import { Pager, pageParam, withPage } from "@/components/frozen";
import { categoryIcon } from "@/lib/category-icons";
import { DELETED_USER, fmtDate, fmtRelative, nowMs } from "@/lib/format";
import { locationLabel } from "@/lib/orders";
import { thumb } from "@/lib/media-url";
import { FEED_PERIODS, averageDays, averageRating, monthOf, periodStart, resolvedIn, workTime, type FeedPeriod } from "@/lib/feed";

export const metadata: Metadata = { title: "Serviços do prédio" };

const PAGE = 13; // o destaque + 12 cartões (quatro linhas de três)

/** Foto preferida de uma fase (na falta, o vídeo). Sem "antes", vale o registro da abertura. */
function mediaOf(o: FeedItem) {
  const pick = (phase: string) => o.media.find((m) => m.phase === phase && m.type === "photo") ?? o.media.find((m) => m.phase === phase);
  return { before: pick("before") ?? pick("opening"), after: pick("after") };
}

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
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
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

/** Quem fez, em quanto tempo e quem aprovou, numa linha */
function summary(o: FeedItem) {
  return [
    resolvedIn(o.createdAt, o.approvedAt) && `Resolvido ${resolvedIn(o.createdAt, o.approvedAt)}`,
    workTime(o.executionMinutes) && `${workTime(o.executionMinutes)} de trabalho`,
  ].filter(Boolean).join(" · ");
}

function CategoryChip({ o }: { o: FeedItem }) {
  if (!o.category) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-surface/95 px-2 py-0.5 text-[11px] font-medium shadow-card ring-1 ring-inset ring-line backdrop-blur" style={{ color: o.category.color }}>
      {createElement(categoryIcon(o.category.icon), { className: "size-3" })}{o.category.name}
    </span>
  );
}

function Stars({ n }: { n: number | null }) {
  if (!n) return null;
  return <span className="inline-flex items-center gap-0.5" aria-label={`${n} de 5`}>{[1, 2, 3, 4, 5].map((i) => <Star key={i} className={cx("size-3.5", i <= n ? "fill-warn text-warn" : "text-line-strong")} />)}</span>;
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

/** Cartão da grade: a foto do depois em destaque, o antes em miniatura e o resumo do serviço. */
function ServiceCard({ o, showCondo }: { o: FeedItem; showCondo: boolean }) {
  const { before, after } = mediaOf(o);
  const cover = after ?? before;
  const inset = after && before ? before : null;
  return (
    <Link href={`/os/${o.id}`} className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-card transition hover:-translate-y-0.5 hover:border-line-strong hover:shadow-pop">
      <div className="relative aspect-[4/3] bg-bg-2">
        {cover ? (
          cover.type === "photo" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb(cover.url, 800)} alt={o.title} loading="lazy" className="size-full object-cover transition duration-500 group-hover:scale-[1.03]" />
          ) : (
            <div className="relative size-full">
              <video src={`${cover.url}#t=0.5`} preload="metadata" muted playsInline className="size-full object-cover" />
              <PlayCircle className="absolute left-1/2 top-1/2 size-10 -translate-x-1/2 -translate-y-1/2 text-white drop-shadow" />
            </div>
          )
        ) : (
          <div className="flex size-full items-center justify-center gap-2 text-xs text-muted"><ImageOff className="size-4" />Sem fotos</div>
        )}
        <div className="absolute left-3 top-3"><CategoryChip o={o} /></div>
        {cover && <span className="absolute right-3 top-3 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur">{after ? "Depois" : "Antes"}</span>}
        {inset?.type === "photo" && (
          <span className="absolute bottom-3 left-3 overflow-hidden rounded-xl shadow-pop ring-2 ring-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={thumb(inset.url, 480)} alt={`${o.title} — antes`} loading="lazy" className="h-14 w-20 object-cover" />
            <span className="absolute inset-x-0 bottom-0 bg-black/55 text-center text-[9px] font-semibold text-white">Antes</span>
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <p className="line-clamp-2 font-display font-semibold leading-snug group-hover:text-brand">{o.title}</p>
        <p className="flex items-center gap-1.5 truncate text-xs text-muted"><MapPin className="size-3.5 shrink-0 text-brand" /><span className="truncate">{locationLabel(o)}{showCondo && ` · ${o.condominium.name}`}</span></p>
        {(o.serviceReport || o.description) && <p className="line-clamp-2 text-sm text-fg-2">{o.serviceReport || o.description}</p>}
        <div className="mt-auto flex items-center gap-2.5 border-t border-line pt-3">
          <Avatar name={o.assignedTo?.name ?? DELETED_USER} size={28} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium">{o.assignedTo?.company || o.assignedTo?.name || DELETED_USER}</p>
            <p className="truncate text-[11px] text-muted">{summary(o) || (o.approvedAt ? `Entregue ${fmtRelative(o.approvedAt)}` : "")}</p>
          </div>
          <Stars n={o.rating} />
        </div>
      </div>
    </Link>
  );
}
