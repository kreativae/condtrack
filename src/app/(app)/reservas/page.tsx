import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { brt, brtParts, isGate, isMonth, monthGrid } from "@/lib/booking";
import { unitLabel } from "@/lib/units";
import { BookingCalendar } from "./booking-calendar";
import { gateCondo, myUnits } from "@/lib/booking-server";
import { Card, CardHeader, Empty, LinkButton, PageHeader, cx } from "@/components/ui";
import { BookingRow, bookingRowInclude } from "./booking-row";

export const metadata: Metadata = { title: "Reservas" };

export default async function BookingsPage({ searchParams }: PageProps<"/reservas">) {
  const user = await requireUser();
  const sp = await searchParams;
  const condoId = await gateCondo(user);
  const header = <PageHeader eyebrow="Áreas comuns" title="Reservas" description="Salão de festas, churrasqueira, quadra e outros espaços do condomínio." />;
  if (!condoId) {
    return <div className="mx-auto max-w-6xl animate-in">{header}<Card><Empty icon={<CalendarDays />} title="Escolha um condomínio">Use o cartão do condomínio no menu.</Empty></Card></div>;
  }
  const gate = isGate(user.role);
  const units = myUnits(user, condoId);
  const unitIds = units.map((u) => u.id);
  const now = new Date();
  const history = sp.ver === "historico";

  if (!gate && !units.length) {
    return <div className="mx-auto max-w-6xl animate-in">{header}<Card><Empty icon={<CalendarDays />} title="Sem unidade vinculada">Reservas são feitas por quem mora em uma unidade do condomínio.</Empty></Card></div>;
  }

  const mineWhere = { condominiumId: condoId, OR: [{ requestedById: user.id }, { unitId: { in: unitIds } }] };
  const month = isMonth(sp.mes) ? sp.mes : brtParts(now).day.slice(0, 7);
  const grid = monthGrid(month);
  const from = brt(grid[0], "00:00");
  const to = new Date(brt(grid.at(-1)!, "00:00").getTime() + 86400_000);
  const [pending, upcoming, past, monthBookings, areas] = await Promise.all([
    gate ? db.booking.findMany({ where: { condominiumId: condoId, status: "pending", endAt: { gt: now } }, include: bookingRowInclude, orderBy: { startAt: "asc" } }) : [],
    db.booking.findMany({
      where: gate ? { condominiumId: condoId, status: "approved", endAt: { gt: now } } : { ...mineWhere, status: { in: ["pending", "approved"] }, endAt: { gt: now } },
      include: bookingRowInclude, orderBy: { startAt: "asc" }, take: gate ? 15 : 30,
    }),
    history
      ? db.booking.findMany({
          where: { AND: [gate ? { condominiumId: condoId } : mineWhere, { OR: [{ endAt: { lte: now } }, { status: { in: ["rejected", "cancelled"] } }] }] },
          include: bookingRowInclude, orderBy: { startAt: "desc" }, take: 100,
        })
      : [],
    db.booking.findMany({
      where: { condominiumId: condoId, status: { in: ["pending", "approved"] }, startAt: { lt: to }, endAt: { gt: from } },
      include: { unit: { include: { building: true } }, requestedBy: { select: { name: true } } },
      orderBy: { startAt: "asc" },
    }),
    db.commonArea.findMany({ where: { condominiumId: condoId, reservable: true }, select: { id: true, name: true, openTime: true, closeTime: true }, orderBy: { name: "asc" } }),
  ]);
  // Morador vê a ocupação de todos, mas só abre (e vê de quem é) as próprias reservas
  const events = monthBookings
    .filter((b) => areas.some((a) => a.id === b.commonAreaId))
    .map((b) => {
      const mine = b.requestedById === user.id || (!!b.unitId && unitIds.includes(b.unitId));
      const open = gate || mine;
      return {
        id: open ? b.id : null,
        areaId: b.commonAreaId,
        startAt: b.startAt.toISOString(),
        endAt: b.endAt.toISOString(),
        status: b.status,
        label: open ? (b.unit ? unitLabel(b.unit) : "Condomínio") + (gate && b.requestedBy ? ` · ${b.requestedBy.name.split(" ")[0]}` : "") : "Reservado",
        mine,
      };
    });

  return (
    <div className="mx-auto max-w-6xl animate-in">
      <PageHeader
        eyebrow="Áreas comuns"
        title="Reservas"
        description={gate ? "Aprove os pedidos e acompanhe a agenda das áreas comuns." : "Reserve um espaço e monte a lista de convidados; a portaria recebe a lista."}
        actions={areas.length > 0 ? <LinkButton href="/reservas/nova"><Plus className="size-4" />Nova reserva</LinkButton> : undefined}
      />
      {!areas.length && <Card className="mb-6"><Empty icon={<CalendarDays />} title="Nenhuma área aberta para reservas">{user.role === "syndic" ? "Marque “Pode ser reservada” nas áreas em Estrutura → Áreas comuns." : "O síndico libera as áreas em Estrutura."}</Empty></Card>}

      {areas.length > 0 && (
        <Card className="mb-6 p-4 sm:p-5">
          <BookingCalendar month={month} today={brtParts(now).day} areas={areas} events={events} canBook={gate || units.length > 0} />
        </Card>
      )}

      <div className="space-y-6">
        {gate && (
          <Card>
            <CardHeader title={`Para aprovar (${pending.length})`} subtitle="O primeiro que decidir vale; quem pediu é avisado." />
            {pending.length ? <div className="divide-y divide-line">{pending.map((b) => <BookingRow key={b.id} b={b} />)}</div> : <p className="px-5 py-6 text-sm text-muted">Nenhum pedido aguardando.</p>}
          </Card>
        )}

        <Card>
          <CardHeader title={gate ? "Próximas reservas aprovadas" : "Minhas reservas"} />
          {upcoming.length ? <div className="divide-y divide-line">{upcoming.map((b) => <BookingRow key={b.id} b={b} />)}</div> : <p className="px-5 py-6 text-sm text-muted">Nenhuma reserva por vir.</p>}
        </Card>

        <div className="text-center">
          <Link href={history ? "/reservas" : "/reservas?ver=historico"} className={cx("text-sm font-medium text-brand hover:underline")}>{history ? "Esconder histórico" : "Ver histórico (passadas, recusadas e canceladas)"}</Link>
        </div>
        {history && (
          <Card>
            <CardHeader title="Histórico" />
            {past.length ? <div className="divide-y divide-line">{past.map((b) => <BookingRow key={b.id} b={b} />)}</div> : <p className="px-5 py-6 text-sm text-muted">Nada no histórico.</p>}
          </Card>
        )}
      </div>
    </div>
  );
}
