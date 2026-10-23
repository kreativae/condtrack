import Link from "next/link";
import { Camera, ClipboardList, MessageCircle } from "lucide-react";
import { Badge, Card, cx } from "@/components/ui";
import { ageLabel, ticketKind, ticketStatus } from "@/lib/tickets";
import { unitLabel } from "@/lib/units";
import { TicketKindIcon } from "./look";

export type TicketCardData = {
  id: string; number: number; kind: string; title: string; description: string; status: string; createdAt: Date; createdByName: string;
  photos: string[]; unit: Parameters<typeof unitLabel>[0] | null; serviceOrder: { protocol: string } | null; _count: { messages: number };
};

/** Cartão do chamado nas listas. `showAuthor`: quem atende vê quem abriu e a unidade. */
export function TicketCard({ t, showAuthor, now }: { t: TicketCardData; showAuthor?: boolean; now: Date }) {
  const st = ticketStatus(t.status);
  const waiting = t.status === "open";
  return (
    <Link href={`/chamados/${t.id}`} className="group block h-full">
      <Card className={cx("flex h-full flex-col p-5 transition group-hover:border-line-strong", waiting && showAuthor && "border-warn/40")}>
        <div className="flex items-start gap-3">
          <TicketKindIcon kind={t.kind} />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-xs text-muted"><span className="font-medium text-fg-2">{ticketKind(t.kind).short}</span><span className="font-num">#{t.number}</span></p>
            <h3 className="mt-0.5 line-clamp-2 font-display font-semibold group-hover:text-brand">{t.title}</h3>
          </div>
          <Badge tone={st.tone} dot>{st.label}</Badge>
        </div>
        <p className="mt-3 line-clamp-2 flex-1 text-sm text-fg-2">{t.description}</p>
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-3 text-xs text-muted">
          {showAuthor && <span className="min-w-0 truncate font-medium text-fg-2">{t.createdByName}{t.unit ? ` · ${unitLabel(t.unit, true)}` : ""}</span>}
          <span>{ageLabel(t.createdAt, now)}</span>
          {t.serviceOrder && <span className="inline-flex items-center gap-1 text-brand"><ClipboardList className="size-3.5" />{t.serviceOrder.protocol}</span>}
          <span className="ml-auto flex items-center gap-3">
            {t.photos.length > 0 && <span className="inline-flex items-center gap-1"><Camera className="size-3.5" />{t.photos.length}</span>}
            {t._count.messages > 0 && <span className="inline-flex items-center gap-1"><MessageCircle className="size-3.5" />{t._count.messages}</span>}
          </span>
        </div>
      </Card>
    </Link>
  );
}
