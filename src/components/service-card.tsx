import Link from "next/link";
import { createElement } from "react";
import { ImageOff, MapPin, PlayCircle, Star } from "lucide-react";
import type { FeedItem } from "./feed-card";
import { Avatar, cx } from "./ui";
import { categoryIcon } from "@/lib/category-icons";
import { DELETED_USER, fmtRelative } from "@/lib/format";
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
