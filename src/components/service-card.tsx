import Link from "next/link";
import { createElement } from "react";
import { CheckCircle2, ImageOff, MapPin, PlayCircle, Star } from "lucide-react";
import type { FeedItem } from "./feed-card";
import { BeforeAfter } from "./before-after";
import { Avatar, Card, cx } from "./ui";
import { categoryIcon } from "@/lib/category-icons";
import { DELETED_USER, fmtDate, fmtRelative } from "@/lib/format";
import { locationLabel } from "@/lib/orders";
import { thumb } from "@/lib/media-url";
import { resolvedIn, workTime } from "@/lib/feed";

// Cartão de serviço entregue (feed e painel do morador): a foto do depois em destaque, o antes em miniatura e o resumo.

/** Foto preferida de uma fase (na falta, o vídeo). Sem "antes", vale o registro da abertura. */
export function mediaOf(o: FeedItem) {
  const pick = (phase: string) => o.media.find((m) => m.phase === phase && m.type === "photo") ?? o.media.find((m) => m.phase === phase);
  return { before: pick("before") ?? pick("opening"), after: pick("after") };
}

/** Quem fez, em quanto tempo e quem aprovou, numa linha */
export function summary(o: FeedItem) {
  return [
    resolvedIn(o.createdAt, o.approvedAt) && `Resolvido ${resolvedIn(o.createdAt, o.approvedAt)}`,
    workTime(o.executionMinutes) && `${workTime(o.executionMinutes)} de trabalho`,
  ].filter(Boolean).join(" · ");
}

export function CategoryChip({ o }: { o: FeedItem }) {
  if (!o.category) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-surface/95 px-2 py-0.5 text-[11px] font-medium shadow-card ring-1 ring-inset ring-line backdrop-blur" style={{ color: o.category.color }}>
      {createElement(categoryIcon(o.category.icon), { className: "size-3" })}{o.category.name}
    </span>
  );
}

export function Stars({ n }: { n: number | null }) {
  if (!n) return null;
  return <span className="inline-flex items-center gap-0.5" aria-label={`${n} de 5`}>{[1, 2, 3, 4, 5].map((i) => <Star key={i} className={cx("size-3.5", i <= n ? "fill-warn text-warn" : "text-line-strong")} />)}</span>;
}

/** Cartão da grade: a foto do depois em destaque, o antes em miniatura e o resumo do serviço. */
export function ServiceCard({ o, showCondo = false }: { o: FeedItem; showCondo?: boolean }) {
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

/** O serviço mais recente com antes e depois: grande, com o comparador deslizante e o resumo completo. */
export function FeaturedService({ o, showCondo = false, badge = "Mais recente" }: { o: FeedItem; showCondo?: boolean; badge?: string }) {
  const { before, after } = mediaOf(o);
  // A largura do lugar onde está (página inteira ou coluna do painel) decide se fica lado a lado
  return (
    <div className="@container">
    <Card className="grid overflow-hidden @3xl:grid-cols-[1.25fr_1fr]">
      <div className="p-3 @3xl:pr-0">
        <BeforeAfter before={before!.url} after={after!.url} alt={o.title} />
      </div>
      <div className="flex flex-col gap-3 p-5 @3xl:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-[11px] font-semibold text-brand">{badge}</span>
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
    </div>
  );
}

/**
 * Últimos serviços (painéis do morador e do conselho): o mais recente com antes e depois em destaque e os outros
 * em cartões. Se adapta à largura de onde está (`@container`): coluna estreita empilha, página larga põe lado a lado.
 */
export function ServiceShowcase({ items, showCondo = false }: { items: FeedItem[]; showCondo?: boolean }) {
  const featured = items.find((o) => { const m = mediaOf(o); return m.before?.type === "photo" && m.after?.type === "photo"; });
  const rest = items.filter((o) => o !== featured);
  return (
    <div className="space-y-4">
      {featured && <FeaturedService o={featured} showCondo={showCondo} />}
      {rest.length > 0 && (
        <div className="@container">
          <div className="grid gap-4 @lg:grid-cols-2 @4xl:grid-cols-3">{rest.map((o) => <ServiceCard key={o.id} o={o} showCondo={showCondo} />)}</div>
        </div>
      )}
    </div>
  );
}
