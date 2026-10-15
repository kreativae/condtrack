import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { MAX_ADVANCE_DAYS, brtParts, isDay, isGate } from "@/lib/booking";
import { condoUnits, gateCondo, myUnits } from "@/lib/booking-server";
import { Card, PageHeader } from "@/components/ui";
import { BookingForm } from "../booking-ui";

export const metadata: Metadata = { title: "Nova reserva" };

export default async function NewBookingPage({ searchParams }: PageProps<"/reservas/nova">) {
  const user = await requireUser();
  const sp = await searchParams;
  const condoId = await gateCondo(user);
  if (!condoId) redirect("/reservas");
  const gate = isGate(user.role);
  const mine = myUnits(user, condoId);
  if (!gate && !mine.length) redirect("/reservas");
  const now = new Date();
  const [areas, units, busy] = await Promise.all([
    db.commonArea.findMany({
      where: { condominiumId: condoId, reservable: true },
      select: { id: true, name: true, capacity: true, openTime: true, closeTime: true, bookingRules: true, requiresApproval: true, description: true },
      orderBy: { name: "asc" },
    }),
    gate ? condoUnits(condoId) : mine,
    db.booking.findMany({
      where: { condominiumId: condoId, status: { in: ["pending", "approved"] }, endAt: { gt: now }, startAt: { lt: new Date(now.getTime() + (MAX_ADVANCE_DAYS + 1) * 86400_000) } },
      select: { commonAreaId: true, startAt: true, endAt: true, status: true },
    }),
  ]);
  return (
    <div className="mx-auto max-w-3xl animate-in">
      <Link href="/reservas" className="mb-6 inline-flex items-center gap-2 text-xs font-medium text-muted hover:text-brand"><ArrowLeft className="size-3.5" />Reservas</Link>
      <PageHeader eyebrow="Áreas comuns" title="Nova reserva" description={gate ? "Reservas feitas pela administração ou portaria já saem aprovadas." : "Escolha o espaço, o dia e o horário. Você é avisado quando for aprovada."} />
      <Card className="p-5 sm:p-6">
        <BookingForm
          areas={areas}
          units={units.map((u) => ({ id: u.id, label: u.label }))}
          busy={busy.map((b) => ({ areaId: b.commonAreaId, startAt: b.startAt.toISOString(), endAt: b.endAt.toISOString(), status: b.status }))}
          today={brtParts(now).day}
          gate={gate}
          initialArea={typeof sp.area === "string" ? sp.area : undefined}
          initialDay={isDay(sp.dia) ? sp.dia : undefined}
        />
      </Card>
    </div>
  );
}
