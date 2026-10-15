import "server-only";
import { db } from "./db";
import type { CurrentUser } from "./auth";
import { adminScope } from "./admin-scope-server";
import { brtParts, isGate, personValid } from "./booking";
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
  return units.sort(byUnit).map((u) => ({ id: u.id, label: unitLabel(u, true) }));
}

/** Pode ver/mexer na reserva: quem atende no condomínio, quem pediu ou quem mora na unidade. */
export function bookingAccess(user: CurrentUser, b: { condominiumId: string; requestedById: string | null; unitId: string | null }, condoId: string | null) {
  const gate = isGate(user.role) && (user.role === "superadmin" ? true : b.condominiumId === condoId);
  const owner = b.requestedById === user.id || (!!b.unitId && myUnits(user, b.condominiumId).some((u) => u.id === b.unitId));
  return { gate, owner, view: gate || owner };
}

/** Pode cadastrar/editar pessoas da unidade: quem mora nela; na portaria, só visitantes e prestadores (síndico e superadmin, tudo). */
export function personAccess(user: CurrentUser, unitId: string, condoId: string, kind: string) {
  if (myUnits(user, condoId).some((u) => u.id === unitId)) return true;
  if (user.role === "superadmin" || user.role === "syndic") return true;
  if (user.role === "doorman" || user.role === "caretaker") return kind !== "resident";
  return false;
}

/** Pessoa cadastrada → dados para os componentes do navegador. */
export function toPersonData(p: { id: string; kind: string; unitId: string; name: string; document: string | null; phone: string | null; company: string | null; notes: string | null; validUntil: Date | null }, unitLabel?: string) {
  return {
    id: p.id, kind: p.kind, unitId: p.unitId, name: p.name, document: p.document, phone: p.phone, company: p.company, notes: p.notes,
    validUntil: p.validUntil ? brtParts(p.validUntil).day : null,
    expired: !personValid(p),
    unitLabel,
  };
}
