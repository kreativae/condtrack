"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser, type CurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { unitLabel } from "@/lib/units";
import {
  HOLDING, MAX_ADVANCE_DAYS, MAX_BOOKING_HOURS, MAX_GUESTS, bookingRange, fitsOpening, fmtPeriod, isDay, isGate, isHM, parseGuests,
} from "@/lib/booking";
import { bookingAccess, gateCondo, myUnits } from "@/lib/booking-server";

export type BookingState = { error?: string; ok?: boolean; message?: string } | undefined;

const GATE_NOTIFY = ["syndic", "caretaker", "doorman"] as const;

function refresh(id?: string) {
  revalidatePath("/reservas");
  revalidatePath("/portaria");
  if (id) revalidatePath(`/reservas/${id}`);
}

async function loadBooking(user: CurrentUser, id: string) {
  const b = await db.booking.findUnique({
    where: { id },
    include: { commonArea: true, unit: { include: { building: true } }, guests: true },
  });
  if (!b) return null;
  const access = bookingAccess(user, b, await gateCondo(user));
  return access.view ? { b, access } : null;
}

const vars = (b: { commonArea: { name: string }; startAt: Date; endAt: Date; unit: Parameters<typeof unitLabel>[0] | null }, extra: Record<string, string | number> = {}) => ({
  area: b.commonArea.name,
  quando: fmtPeriod(b.startAt, b.endAt),
  unidade: b.unit ? unitLabel(b.unit) : "sem unidade",
  ...extra,
});

/** Nova reserva. Quem atende na portaria reserva para qualquer unidade e já sai aprovada. */
export async function createBooking(_prev: BookingState, form: FormData): Promise<BookingState> {
  const user = await requireUser();
  if (user.impersonator) return { error: "Indisponível em modo de visualização." };
  const condoId = await gateCondo(user);
  if (!condoId) return { error: "Escolha um condomínio no menu." };
  const gate = isGate(user.role);

  const areaId = String(form.get("areaId") ?? "");
  const unitId = String(form.get("unitId") ?? "") || null;
  const day = String(form.get("day") ?? "");
  const start = String(form.get("start") ?? "");
  const end = String(form.get("end") ?? "");
  const notes = String(form.get("notes") ?? "").trim().slice(0, 1000);
  const guests = parseGuests(String(form.get("guests") ?? ""));

  const area = await db.commonArea.findFirst({ where: { id: areaId, condominiumId: condoId, reservable: true } });
  if (!area) return { error: "Escolha uma área disponível para reserva." };
  const mine = myUnits(user, condoId);
  if (!gate && !mine.length) return { error: "Só quem mora em uma unidade do condomínio pode reservar." };
  if (!unitId && !gate) return { error: "Escolha a unidade." };
  if (unitId) {
    const ok = mine.some((u) => u.id === unitId) || (gate && (await db.unit.count({ where: { id: unitId, building: { condominiumId: condoId } } })) > 0);
    if (!ok) return { error: "Unidade inválida." };
  }
  if (!isDay(day) || !isHM(start) || !isHM(end)) return { error: "Informe o dia e os horários." };
  const { startAt, endAt } = bookingRange(day, start, end);
  if (startAt.getTime() < Date.now()) return { error: "Esse horário já passou." };
  if (startAt.getTime() > Date.now() + MAX_ADVANCE_DAYS * 86400_000) return { error: `Dá para reservar com até ${MAX_ADVANCE_DAYS} dias de antecedência.` };
  if (endAt.getTime() - startAt.getTime() > MAX_BOOKING_HOURS * 3600_000) return { error: `A reserva pode ter até ${MAX_BOOKING_HOURS} horas.` };
  if (!fitsOpening(start, end, area.openTime, area.closeTime)) return { error: `${area.name} funciona das ${area.openTime} às ${area.closeTime}.` };
  const limit = Math.min(area.capacity ?? MAX_GUESTS, MAX_GUESTS);
  if (guests.length > limit) return { error: `A lista tem ${guests.length} convidados; o limite de ${area.name} é ${limit}.` };

  const autoApprove = gate || !area.requiresApproval;
  let id = "";
  try {
    // Serializável: duas pessoas pedindo o mesmo horário ao mesmo tempo não passam juntas
    id = await db.$transaction(
      async (tx) => {
        const clash = await tx.booking.findFirst({
          where: { commonAreaId: area.id, status: { in: HOLDING }, startAt: { lt: endAt }, endAt: { gt: startAt } },
          select: { startAt: true, endAt: true },
        });
        if (clash) throw new Error(`${area.name} já está reservada em ${fmtPeriod(clash.startAt, clash.endAt)}.`);
        const b = await tx.booking.create({
          data: {
            condominiumId: condoId, commonAreaId: area.id, unitId, requestedById: user.id, startAt, endAt, notes,
            status: autoApprove ? "approved" : "pending",
            ...(autoApprove && { decidedAt: new Date(), decidedById: gate ? user.id : null, decisionNote: gate ? null : "Aprovada automaticamente (a área não exige aprovação)." }),
            guests: { create: guests },
          },
        });
        return b.id;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034") return { error: "Outra reserva acabou de ser feita nesse horário. Confira e tente de novo." };
    return { error: e instanceof Error ? e.message : "Não foi possível reservar." };
  }

  const b = (await db.booking.findUnique({ where: { id }, include: { commonArea: true, unit: { include: { building: true } } } }))!;
  await audit(user, "create", "booking", id, { new: { area: area.name, quando: fmtPeriod(startAt, endAt), convidados: guests.length, status: b.status }, condominiumId: condoId });
  if (b.status === "pending") {
    await notify(
      { condominiumId: condoId, roles: [...GATE_NOTIFY], exclude: user.id },
      { type: "booking_request", vars: { ...vars(b), autor: user.name, convidados: guests.length }, referenceType: "booking", referenceId: id },
    );
  }
  refresh();
  redirect(`/reservas/${id}`);
}

/** Aprovar ou recusar (síndico, zelador, porteiro, superadmin). Só decide quem chega primeiro. */
export async function decideBooking(id: string, decision: "approved" | "rejected", _prev: BookingState, form: FormData): Promise<BookingState> {
  const user = await requireUser(...(["superadmin", "syndic", "caretaker", "doorman"] as const));
  if (user.impersonator) return { error: "Indisponível em modo de visualização." };
  const r = await loadBooking(user, id);
  if (!r?.access.gate) return { error: "Sem permissão." };
  const note = String(form.get("note") ?? "").trim().slice(0, 500);
  if (decision === "rejected" && note.length < 3) return { error: "Diga o motivo da recusa." };
  const done = await db.booking.updateMany({
    where: { id, status: "pending" },
    data: { status: decision, decidedById: user.id, decidedAt: new Date(), decisionNote: note || null },
  });
  if (!done.count) return { error: "Essa reserva já foi decidida." };
  await audit(user, decision === "approved" ? "approve" : "reject", "booking", id, { new: { motivo: note || undefined }, condominiumId: r.b.condominiumId });
  await notify(
    { condominiumId: r.b.condominiumId, userIds: [r.b.requestedById], exclude: user.id },
    { type: "booking_decided", vars: { ...vars(r.b), autor: user.name, decisao: decision === "approved" ? "aprovada" : "recusada", comentario: note }, referenceType: "booking", referenceId: id },
  );
  refresh(id);
  return { ok: true, message: decision === "approved" ? "Reserva aprovada." : "Reserva recusada." };
}

/** Cancelar: quem pediu (ou mora na unidade) e quem atende, até o fim do horário. */
export async function cancelBooking(id: string, _prev: BookingState, form: FormData): Promise<BookingState> {
  const user = await requireUser();
  if (user.impersonator) return { error: "Indisponível em modo de visualização." };
  const r = await loadBooking(user, id);
  if (!r || !(r.access.owner || r.access.gate)) return { error: "Sem permissão." };
  if (r.b.endAt.getTime() < Date.now()) return { error: "A reserva já terminou." };
  const reason = String(form.get("reason") ?? "").trim().slice(0, 500);
  const done = await db.booking.updateMany({ where: { id, status: { in: HOLDING } }, data: { status: "cancelled", cancelledAt: new Date(), decisionNote: reason || null } });
  if (!done.count) return { error: "Essa reserva não está mais ativa." };
  await audit(user, "cancel", "booking", id, { old: { status: r.b.status }, new: { motivo: reason || undefined }, condominiumId: r.b.condominiumId });
  // Morador cancelou uma aprovada: avisa quem atende. Portaria cancelou: avisa quem pediu.
  const target = r.access.owner && !r.access.gate
    ? r.b.status === "approved" ? { condominiumId: r.b.condominiumId, roles: [...GATE_NOTIFY] } : null
    : { condominiumId: r.b.condominiumId, userIds: [r.b.requestedById] };
  if (target) {
    await notify({ ...target, exclude: user.id }, { type: "booking_cancelled", vars: { ...vars(r.b), autor: user.name, comentario: reason }, referenceType: "booking", referenceId: id });
  }
  refresh(id);
  return { ok: true, message: "Reserva cancelada." };
}

/** Atualiza a lista de convidados (quem já chegou fica na lista). */
export async function saveGuests(id: string, _prev: BookingState, form: FormData): Promise<BookingState> {
  const user = await requireUser();
  if (user.impersonator) return { error: "Indisponível em modo de visualização." };
  const r = await loadBooking(user, id);
  if (!r || !(r.access.owner || r.access.gate)) return { error: "Sem permissão." };
  if (!HOLDING.includes(r.b.status as (typeof HOLDING)[number])) return { error: "A reserva não está ativa." };
  if (r.b.endAt.getTime() < Date.now()) return { error: "A reserva já terminou." };
  const list = parseGuests(String(form.get("guests") ?? ""));
  const arrived = r.b.guests.filter((g) => g.checkedInAt);
  const key = (n: string) => n.toLowerCase();
  const keep = new Set(list.map((g) => key(g.name)));
  const limit = Math.min(r.b.commonArea.capacity ?? MAX_GUESTS, MAX_GUESTS);
  const total = new Set([...list.map((g) => key(g.name)), ...arrived.map((g) => key(g.name))]).size;
  if (total > limit) return { error: `A lista teria ${total} convidados; o limite de ${r.b.commonArea.name} é ${limit}.` };

  const existing = new Map(r.b.guests.map((g) => [key(g.name), g]));
  const remove = r.b.guests.filter((g) => !g.checkedInAt && !keep.has(key(g.name))).map((g) => g.id);
  const add = list.filter((g) => !existing.has(key(g.name)));
  const update = list.filter((g) => existing.has(key(g.name)) && (existing.get(key(g.name))!.document ?? null) !== g.document);
  await db.$transaction([
    db.bookingGuest.deleteMany({ where: { id: { in: remove } } }),
    db.bookingGuest.createMany({ data: add.map((g) => ({ ...g, bookingId: id })) }),
    ...update.map((g) => db.bookingGuest.update({ where: { id: existing.get(key(g.name))!.id }, data: { document: g.document } })),
  ]);
  if (remove.length || add.length || update.length) {
    await audit(user, "update_guests", "booking", id, { new: { incluidos: add.length, removidos: remove.length, total }, condominiumId: r.b.condominiumId });
  }
  refresh(id);
  return { ok: true, message: `Lista salva: ${total} convidado(s).` };
}

/** Portaria marca (ou desfaz) a chegada de um convidado; a chegada também vai para o registro de entradas. */
export async function toggleGuestArrival(guestId: string) {
  const user = await requireUser(...(["superadmin", "syndic", "caretaker", "doorman"] as const));
  if (user.impersonator) return;
  const g = await db.bookingGuest.findUnique({ where: { id: guestId }, select: { id: true, name: true, document: true, checkedInAt: true, bookingId: true } });
  if (!g) return;
  const r = await loadBooking(user, g.bookingId);
  if (!r?.access.gate || r.b.status !== "approved") return;
  if (g.checkedInAt) {
    await db.$transaction([
      db.bookingGuest.update({ where: { id: g.id }, data: { checkedInAt: null, checkedInById: null } }),
      db.accessEntry.deleteMany({ where: { guestId: g.id } }),
    ]);
  } else {
    await db.$transaction([
      db.bookingGuest.update({ where: { id: g.id }, data: { checkedInAt: new Date(), checkedInById: user.id } }),
      db.accessEntry.create({
        data: { condominiumId: r.b.condominiumId, unitId: r.b.unitId, guestId: g.id, kind: "guest", name: g.name, document: g.document, notes: `Convidado: ${r.b.commonArea.name}`, createdById: user.id, createdBy: user.name },
      }),
    ]);
  }
  refresh(g.bookingId);
}
