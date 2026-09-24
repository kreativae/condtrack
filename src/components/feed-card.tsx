import Link from "next/link";
import { CheckCircle2, MapPin, Star } from "lucide-react";
import { BeforeAfter } from "./before-after";
import { Avatar, Card } from "./ui";
import { fmtDateTime, fmtRelative } from "@/lib/format";
import { locationLabel } from "@/lib/orders";
import type { Prisma } from "@prisma/client";

export const feedInclude = {
  condominium: { select: { name: true } },
  category: true,
  commonArea: true,
  unit: { include: { building: true } },
  assignedTo: { select: { name: true, company: true } },
  validatedBy: { select: { name: true } },
  approvedBy: { select: { name: true } },
  media: { where: { phase: { in: ["before", "after"] }, type: "photo" }, orderBy: { uploadedAt: "asc" } },
} satisfies Prisma.ServiceOrderInclude;

export type FeedItem = Prisma.ServiceOrderGetPayload<{ include: typeof feedInclude }>;

/** `showCondo`: exibe o condomínio (feed do superadmin, com todos os prédios). */
export function FeedCard({ o, showCondo }: { o: FeedItem; showCondo?: boolean }) {
  const before = o.media.find((m) => m.phase === "before");
  const after = o.media.find((m) => m.phase === "after");
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4">
        <Avatar name={o.assignedTo?.name ?? "?"} />
        <div className="min-w-0 flex-1 text-sm">
          <p className="truncate">
            <span className="font-medium">{o.assignedTo?.name}</span>
            {o.assignedTo?.company && <span className="text-muted"> · {o.assignedTo.company}</span>}
          </p>
          <p className="text-xs text-muted">Concluído {o.approvedAt ? fmtRelative(o.approvedAt) : ""}{showCondo && <> · <span className="font-medium text-fg-2">{o.condominium.name}</span></>}</p>
        </div>
        {o.category && (
          <span className="rounded-full px-2.5 py-0.5 text-[11px] ring-1 ring-inset ring-line" style={{ color: o.category.color }}>
            {o.category.name}
          </span>
        )}
      </div>
      {before && after ? (
        <div className="px-3"><BeforeAfter before={before.url} after={after.url} alt={o.title} /></div>
      ) : after ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={after.url} alt={o.title} className="aspect-[16/10] w-full object-cover" />
      ) : null}
      <div className="space-y-3 px-5 py-4">
        <Link href={`/os/${o.id}`} className="block font-display font-semibold text-xl leading-snug hover:text-brand">{o.title}</Link>
        <p className="flex items-center gap-1.5 text-xs text-muted"><MapPin className="size-3.5 text-brand" />{locationLabel(o)}</p>
        {o.serviceReport && <p className="line-clamp-2 text-sm text-fg-2">{o.serviceReport}</p>}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-line pt-3 text-xs text-muted">
          <span className="flex items-center gap-1.5"><CheckCircle2 className="size-3.5 text-ok" />Validado por {o.validatedBy?.name ?? "—"}</span>
          <span>Aprovado por {o.approvedBy?.name ?? "—"} · {fmtDateTime(o.approvedAt)}</span>
          {o.rating && <span className="flex items-center gap-1"><Star className="size-3.5 fill-brand text-brand" />{o.rating}/5</span>}
        </div>
      </div>
    </Card>
  );
}
