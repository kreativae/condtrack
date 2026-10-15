import Link from "next/link";
import { ChevronRight, Users } from "lucide-react";
import { Badge } from "@/components/ui";
import { BOOKING_STATUS, fmtPeriod, type BookingStatus } from "@/lib/booking";
import { unitLabel } from "@/lib/units";

type Row = {
  id: string; status: string; startAt: Date; endAt: Date;
  commonArea: { name: string };
  unit: Parameters<typeof unitLabel>[0] | null;
  requestedBy: { name: string } | null;
  _count: { guests: number };
};

/** Linha de reserva; `link` = pode abrir o detalhe (quem atende ou quem reservou). */
export function BookingRow({ b, link = true, who = true }: { b: Row; link?: boolean; who?: boolean }) {
  const st = BOOKING_STATUS[b.status as BookingStatus] ?? BOOKING_STATUS.pending;
  const body = (
    <>
      <div className="min-w-0 flex-1">
        <p className="font-medium">{b.commonArea.name}</p>
        <p className="text-sm text-fg-2">{fmtPeriod(b.startAt, b.endAt)}</p>
        {who && (
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted">
            <span>{b.unit ? unitLabel(b.unit) : "Condomínio"}{b.requestedBy && ` · ${b.requestedBy.name}`}</span>
            <span className="inline-flex items-center gap-1"><Users className="size-3" />{b._count.guests}</span>
          </p>
        )}
      </div>
      <Badge tone={st.tone} dot>{st.label}</Badge>
      {link && <ChevronRight className="size-4 shrink-0 text-muted" />}
    </>
  );
  return link
    ? <Link href={`/reservas/${b.id}`} className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-bg-2">{body}</Link>
    : <div className="flex items-center gap-3 px-5 py-3.5">{body}</div>;
}

export const bookingRowInclude = {
  commonArea: { select: { name: true } },
  unit: { include: { building: true } },
  requestedBy: { select: { name: true } },
  _count: { select: { guests: true } },
} as const;
