import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isGate } from "@/lib/booking";
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
    return <div className="mx-auto max-w-4xl animate-in">{header}<Card><Empty icon={<CalendarDays />} title="Escolha um condomínio">Use o cartão do condomínio no menu.</Empty></Card></div>;
  }
  const gate = isGate(user.role);
  const units = myUnits(user, condoId);
  const unitIds = units.map((u) => u.id);
  const now = new Date();
  const history = sp.ver === "historico";

  if (!gate && !units.length) {
    return <div className="mx-auto max-w-4xl animate-in">{header}<Card><Empty icon={<CalendarDays />} title="Sem unidade vinculada">Reservas são feitas por quem mora em uma unidade do condomínio.</Empty></Card></div>;
  }

  const mineWhere = { condominiumId: condoId, OR: [{ requestedById: user.id }, { unitId: { in: unitIds } }] };
  const [pending, upcoming, past, agenda, areas] = await Promise.all([
    gate ? db.booking.findMany({ where: { condominiumId: condoId, status: "pending", endAt: { gt: now } }, include: bookingRowInclude, orderBy: { startAt: "asc" } }) : [],
    db.booking.findMany({
      where: gate ? { condominiumId: condoId, status: "approved", endAt: { gt: now } } : { ...mineWhere, status: { in: ["pending", "approved"] }, endAt: { gt: now } },
      include: bookingRowInclude, orderBy: { startAt: "asc" }, take: 60,
    }),
    history
      ? db.booking.findMany({
          where: { AND: [gate ? { condominiumId: condoId } : mineWhere, { OR: [{ endAt: { lte: now } }, { status: { in: ["rejected", "cancelled"] } }] }] },
          include: bookingRowInclude, orderBy: { startAt: "desc" }, take: 100,
        })
      : [],
    // Morador vê a ocupação das áreas (sem quem reservou)
    gate ? [] : db.booking.findMany({ where: { condominiumId: condoId, status: { in: ["pending", "approved"] }, endAt: { gt: now }, NOT: mineWhere }, include: bookingRowInclude, orderBy: { startAt: "asc" }, take: 30 }),
    db.commonArea.count({ where: { condominiumId: condoId, reservable: true } }),
  ]);

  return (
    <div className="mx-auto max-w-4xl animate-in">
      <PageHeader
        eyebrow="Áreas comuns"
        title="Reservas"
        description={gate ? "Aprove os pedidos e acompanhe a agenda das áreas comuns." : "Reserve um espaço e monte a lista de convidados; a portaria recebe a lista."}
        actions={areas > 0 ? <LinkButton href="/reservas/nova"><Plus className="size-4" />Nova reserva</LinkButton> : undefined}
      />
      {!areas && <Card className="mb-6"><Empty icon={<CalendarDays />} title="Nenhuma área aberta para reservas">{user.role === "syndic" ? "Marque “Pode ser reservada” nas áreas em Estrutura → Áreas comuns." : "O síndico libera as áreas em Estrutura."}</Empty></Card>}

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

        {!gate && agenda.length > 0 && (
          <Card>
            <CardHeader title="Agenda do condomínio" subtitle="Horários já ocupados por outras unidades." />
            <div className="divide-y divide-line">{agenda.map((b) => <BookingRow key={b.id} b={b} link={false} who={false} />)}</div>
          </Card>
        )}

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
