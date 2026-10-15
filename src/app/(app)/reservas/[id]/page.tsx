import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { BOOKING_STATUS, fmtPeriod, guestsToText, type BookingStatus } from "@/lib/booking";
import { bookingAccess, gateCondo } from "@/lib/booking-server";
import { fmtDateTime } from "@/lib/format";
import { unitLabel } from "@/lib/units";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui";
import { ArrivalButton, CancelForm, DecisionForm, GuestsEditor } from "../booking-ui";

export const metadata: Metadata = { title: "Reserva" };

export default async function BookingPage({ params }: PageProps<"/reservas/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const b = await db.booking.findUnique({
    where: { id },
    include: {
      commonArea: true,
      unit: { include: { building: true } },
      requestedBy: { select: { name: true, phone: true } },
      decidedBy: { select: { name: true } },
      guests: { orderBy: { name: "asc" } },
    },
  });
  if (!b) notFound();
  const access = bookingAccess(user, b, await gateCondo(user));
  if (!access.view) notFound();

  const st = BOOKING_STATUS[b.status as BookingStatus] ?? BOOKING_STATUS.pending;
  const active = (b.status === "pending" || b.status === "approved") && b.endAt > new Date();
  const arrived = b.guests.filter((g) => g.checkedInAt).length;

  return (
    <div className="mx-auto max-w-4xl animate-in">
      <Link href="/reservas" className="mb-6 inline-flex items-center gap-2 text-xs font-medium text-muted hover:text-brand"><ArrowLeft className="size-3.5" />Reservas</Link>
      <PageHeader eyebrow={b.unit ? unitLabel(b.unit) : "Condomínio"} title={b.commonArea.name} description={fmtPeriod(b.startAt, b.endAt)} actions={<Badge tone={st.tone} dot>{st.label}</Badge>} />

      <div className="grid items-start gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title={`Convidados (${b.guests.length})`} subtitle={access.gate && b.status === "approved" ? `${arrived} chegaram` : undefined} />
          {access.gate && b.status === "approved" && b.guests.length > 0 && (
            <ul className="divide-y divide-line">
              {b.guests.map((g) => (
                <li key={g.id} className="flex items-center gap-3 px-5 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{g.name}</p>
                    <p className="text-xs text-muted">{[g.document, g.checkedInAt && `chegou ${fmtDateTime(g.checkedInAt)}`].filter(Boolean).join(" · ") || "—"}</p>
                  </div>
                  <ArrivalButton guestId={g.id} arrived={!!g.checkedInAt} />
                </li>
              ))}
            </ul>
          )}
          <div className="p-5">
            {active ? (
              <GuestsEditor id={b.id} initial={guestsToText(b.guests)} capacity={b.commonArea.capacity} />
            ) : !(access.gate && b.status === "approved") ? (
              b.guests.length ? <ul className="space-y-1 text-sm">{b.guests.map((g) => <li key={g.id}>• {g.name}{g.document && <span className="text-muted"> · {g.document}</span>}</li>)}</ul> : <p className="text-sm text-muted">Sem convidados.</p>
            ) : null}
          </div>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Detalhes" />
            <dl className="space-y-3 p-5 text-sm">
              <div><dt className="text-xs text-muted">Pedida por</dt><dd>{b.requestedBy?.name ?? "—"}{access.gate && b.requestedBy?.phone && <span className="text-muted"> · {b.requestedBy.phone}</span>} <span className="text-muted">em {fmtDateTime(b.createdAt)}</span></dd></div>
              {b.notes && <div><dt className="text-xs text-muted">Observações</dt><dd className="whitespace-pre-line">{b.notes}</dd></div>}
              {b.decidedAt && <div><dt className="text-xs text-muted">{b.status === "rejected" ? "Recusada" : "Aprovada"}</dt><dd>{b.decidedBy?.name ?? "Automaticamente"} <span className="text-muted">em {fmtDateTime(b.decidedAt)}</span></dd></div>}
              {b.cancelledAt && <div><dt className="text-xs text-muted">Cancelada</dt><dd>{fmtDateTime(b.cancelledAt)}</dd></div>}
              {b.decisionNote && <div><dt className="text-xs text-muted">Comentário</dt><dd className="whitespace-pre-line">{b.decisionNote}</dd></div>}
              {b.commonArea.bookingRules && <div><dt className="text-xs text-muted">Regras da área</dt><dd className="whitespace-pre-line text-fg-2">{b.commonArea.bookingRules}</dd></div>}
            </dl>
          </Card>
          {access.gate && b.status === "pending" && active && (
            <Card><CardHeader title="Decidir" /><div className="p-5"><DecisionForm id={b.id} /></div></Card>
          )}
          {active && (access.owner || access.gate) && <div className="px-1"><CancelForm id={b.id} /></div>}
        </div>
      </div>
    </div>
  );
}
