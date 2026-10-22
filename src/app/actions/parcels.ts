"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { unitLabel } from "@/lib/units";
import { brtParts } from "@/lib/booking";
import { gateCondo } from "@/lib/booking-server";
import { normalizeLocation } from "@/lib/parcels";
import { ALLOWED_MIME, saveFile } from "@/lib/storage";

export type ParcelState = { error?: string; ok?: boolean; message?: string } | undefined;

const GATE = ["superadmin", "syndic", "caretaker", "doorman"] as const;
const clip = (v: FormDataEntryValue | null, n: number) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, n) || null;
const describe = (p: { carrier: string | null; description: string | null }) => [p.carrier, p.description].filter(Boolean).join(" · ") || "Encomenda";

function refresh() {
  revalidatePath("/portaria");
  revalidatePath("/minha-unidade");
}

async function residentsOf(unitId: string) {
  return (await db.userUnit.findMany({ where: { unitId }, select: { userId: true } })).map((r) => r.userId);
}

/** Portaria recebe uma encomenda para a unidade e avisa quem mora nela (com o local onde ficou guardada). */
export async function receiveParcel(_prev: ParcelState, form: FormData): Promise<ParcelState> {
  const user = await requireUser(...GATE);
  if (user.impersonator) return { error: "Indisponível em modo de visualização." };
  const condoId = await gateCondo(user);
  if (!condoId) return { error: "Escolha um condomínio no menu." };
  const unitId = String(form.get("unitId") ?? "");
  const unit = await db.unit.findFirst({ where: { id: unitId, building: { condominiumId: condoId } }, include: { building: true } });
  if (!unit) return { error: "Escolha a unidade." };
  const volumes = Math.min(99, Math.max(1, Math.round(Number(form.get("volumes") ?? 1)) || 1));
  const data = {
    recipient: clip(form.get("recipient"), 120),
    carrier: clip(form.get("carrier"), 60),
    description: clip(form.get("description"), 200),
    location: normalizeLocation(String(form.get("location") ?? "")),
    notes: clip(form.get("notes"), 500),
    volumes,
  };
  const photo = form.get("photo");
  const hasPhoto = photo instanceof File && photo.size > 0;
  if (hasPhoto && !ALLOWED_MIME.includes(photo.type)) return { error: "A foto precisa ser JPG, PNG ou WEBP." };
  if (hasPhoto && photo.size > 2 * 1024 * 1024) return { error: "Foto muito grande (máx. 2 MB)." };
  let p = await db.parcel.create({ data: { ...data, condominiumId: condoId, unitId, receivedById: user.id, receivedByName: user.name } });
  // A foto fica na pasta da própria encomenda (a rota de mídias confere quem pode ver)
  if (hasPhoto) {
    const photoUrl = await saveFile(photo, `parcel-${p.id}`).catch(() => null);
    if (photoUrl) p = await db.parcel.update({ where: { id: p.id }, data: { photoUrl } });
  }
  await audit(user, "receive", "parcel", p.id, { new: { unidade: unitLabel(unit), local: data.location, volumes }, condominiumId: condoId });

  const to = await residentsOf(unitId);
  if (to.length) {
    await notify(
      { condominiumId: condoId, userIds: to, exclude: user.id },
      {
        type: "parcel_received",
        vars: { unidade: unitLabel(unit), descricao: describe(p), volumes: volumes === 1 ? "1 volume" : `${volumes} volumes`, destinatario: p.recipient ?? "", local: p.location ?? "", autor: user.name },
        referenceType: "parcel",
        referenceId: p.id,
      },
    );
  }
  refresh();
  return { ok: true, message: `Encomenda registrada para ${unitLabel(unit, true)}${to.length ? "; a unidade foi avisada" : " (a unidade não tem morador com conta para avisar)"}.` };
}

/** Dá baixa: quem retirou. A unidade recebe o aviso da retirada. */
export async function deliverParcel(id: string, _prev: ParcelState, form: FormData): Promise<ParcelState> {
  const user = await requireUser(...GATE);
  if (user.impersonator) return { error: "Indisponível em modo de visualização." };
  const condoId = await gateCondo(user);
  if (!condoId) return { error: "Escolha um condomínio no menu." };
  const who = clip(form.get("deliveredTo"), 120);
  if (!who || who.length < 2) return { error: "Informe quem retirou." };
  const done = await db.parcel.updateMany({
    where: { id, condominiumId: condoId, status: "waiting" },
    data: { status: "delivered", deliveredAt: new Date(), deliveredTo: who, deliveredById: user.id, deliveredByName: user.name },
  });
  if (!done.count) return { error: "Essa encomenda já foi entregue." };
  const p = (await db.parcel.findUnique({ where: { id }, include: { unit: { include: { building: true } } } }))!;
  await audit(user, "deliver", "parcel", id, { new: { retiradaPor: who }, condominiumId: condoId });
  const to = await residentsOf(p.unitId);
  if (to.length) {
    await notify(
      { condominiumId: condoId, userIds: to, exclude: user.id },
      { type: "parcel_delivered", vars: { unidade: unitLabel(p.unit), descricao: describe(p), quem: who, hora: brtParts(p.deliveredAt!).hm, autor: user.name }, referenceType: "parcel", referenceId: id },
    );
  }
  refresh();
  return { ok: true, message: `Entregue a ${who}.` };
}

/** Devolvida ao remetente (ou registrada por engano): sai da lista de espera, com o motivo. */
export async function returnParcel(id: string, _prev: ParcelState, form: FormData): Promise<ParcelState> {
  const user = await requireUser(...GATE);
  if (user.impersonator) return { error: "Indisponível em modo de visualização." };
  const condoId = await gateCondo(user);
  if (!condoId) return { error: "Escolha um condomínio no menu." };
  const reason = clip(form.get("reason"), 300);
  if (!reason || reason.length < 3) return { error: "Diga o motivo." };
  const done = await db.parcel.updateMany({
    where: { id, condominiumId: condoId, status: "waiting" },
    data: { status: "returned", deliveredAt: new Date(), deliveredTo: null, deliveredById: user.id, deliveredByName: user.name, notes: reason },
  });
  if (!done.count) return { error: "Essa encomenda não está mais aguardando." };
  await audit(user, "return", "parcel", id, { new: { motivo: reason }, condominiumId: condoId });
  refresh();
  return { ok: true, message: "Encomenda marcada como devolvida." };
}

/** Corrige o local onde a encomenda está guardada. */
export async function moveParcel(id: string, location: string) {
  const user = await requireUser(...GATE);
  if (user.impersonator) return;
  const condoId = await gateCondo(user);
  if (!condoId) return;
  await db.parcel.updateMany({ where: { id, condominiumId: condoId, status: "waiting" }, data: { location: normalizeLocation(location) } });
  refresh();
}
