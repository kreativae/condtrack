import "server-only";
import { db } from "./db";
import type { CurrentUser } from "./auth";
import { adminScope } from "./admin-scope-server";
import { brtParts, docKey, grantSchedule, grantStatus, isGate } from "./booking";
import { byUnit, unitLabel } from "./units";

/** Condomínio em que a pessoa reserva/atende: o ativo, ou o escolhido no menu pelo superadmin (null = nenhum). */
export async function gateCondo(user: CurrentUser) {
  if (user.role === "superadmin") return (await adminScope(user))?.id ?? null;
  return user.condominiumId;
}

/** Unidades em que a pessoa mora, no condomínio. */
export function myUnits(user: CurrentUser, condoId: string) {
  return user.units.filter((u) => u.unit.building.condominiumId === condoId).map((u) => ({ id: u.unitId, label: unitLabel(u.unit), role: u.role }));
}

/** Todas as unidades do condomínio, em ordem (para quem atende na portaria). */
export async function condoUnits(condoId: string) {
  const units = await db.unit.findMany({ where: { building: { condominiumId: condoId } }, include: { building: true } });
  // number e building: a busca digitando da portaria ("502", "aurora 502") usa os dois
  return units.sort(byUnit).map((u) => ({ id: u.id, label: unitLabel(u, true), number: u.number, building: u.building.name }));
}

/** Pode ver/mexer na reserva: quem atende no condomínio, quem pediu ou quem mora na unidade. */
export function bookingAccess(user: CurrentUser, b: { condominiumId: string; requestedById: string | null; unitId: string | null }, condoId: string | null) {
  const gate = isGate(user.role) && (user.role === "superadmin" ? true : b.condominiumId === condoId);
  const owner = b.requestedById === user.id || (!!b.unitId && myUnits(user, b.condominiumId).some((u) => u.id === b.unitId));
  return { gate, owner, view: gate || owner };
}

/**
 * Pode criar/editar uma autorização: quem mora na unidade (qualquer tipo); síndico e superadmin (tudo, inclusive
 * o condomínio); porteiro e zelador (visitantes, prestadores e entregas, em qualquer unidade ou no condomínio).
 */
export function grantAccess(user: CurrentUser, condoId: string, unitId: string | null, kind: string) {
  if (user.role === "superadmin" || user.role === "syndic") return true;
  if (unitId && myUnits(user, condoId).some((u) => u.id === unitId)) return true;
  if (user.role === "doorman" || user.role === "caretaker") return kind !== "resident";
  return false;
}

/** Acha a pessoa pelo documento no condomínio (ou cria). Quem já existe mantém o nome; telefone e empresa só completam. */
export async function findOrCreatePerson(condoId: string, data: { name: string; document: string | null; phone: string | null; company: string | null }, createdById: string) {
  const key = docKey(data.document);
  if (key) {
    const found = await db.accessPerson.findUnique({ where: { condominiumId_docKey: { condominiumId: condoId, docKey: key } } });
    if (found) {
      if ((!found.phone && data.phone) || (!found.company && data.company)) {
        await db.accessPerson.update({ where: { id: found.id }, data: { phone: found.phone ?? data.phone, company: found.company ?? data.company } });
      }
      return { person: found, existed: true };
    }
  }
  const person = await db.accessPerson.create({ data: { condominiumId: condoId, ...data, docKey: key, createdById } });
  return { person, existed: false };
}

/** Autorização → dados para os componentes do navegador. */
export function toGrantData(g: { id: string; personId: string; unitId: string | null; kind: string; validFrom: Date | null; validUntil: Date | null; weekdays: string; timeFrom: string | null; timeTo: string | null; notes: string | null; createdByName: string | null; createdAt: Date }, now = new Date()) {
  return {
    id: g.id, personId: g.personId, unitId: g.unitId, kind: g.kind, weekdays: g.weekdays, timeFrom: g.timeFrom, timeTo: g.timeTo, notes: g.notes, createdByName: g.createdByName,
    validFrom: g.validFrom ? brtParts(g.validFrom).day : null,
    validUntil: g.validUntil ? brtParts(g.validUntil).day : null,
    schedule: grantSchedule(g),
    status: grantStatus(g, now),
  };
}
export type GrantData = ReturnType<typeof toGrantData>;
