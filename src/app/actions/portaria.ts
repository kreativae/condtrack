"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { unitLabel } from "@/lib/units";
import { PERSON_KINDS, brtParts, isDay, isGate, isPersonKind } from "@/lib/booking";
import { gateCondo, personAccess } from "@/lib/booking-server";

export type PortariaState = { error?: string; ok?: boolean; message?: string } | undefined;

const clip = (v: FormDataEntryValue | null, n: number) => String(v ?? "").trim().slice(0, n) || null;

function refresh() {
  revalidatePath("/minha-unidade");
  revalidatePath("/portaria");
}

/** Cadastra ou edita uma pessoa da unidade (morador, visitante ou prestador). */
export async function savePerson(id: string | null, _prev: PortariaState, form: FormData): Promise<PortariaState> {
  const user = await requireUser();
  if (user.impersonator) return { error: "Indisponível em modo de visualização." };
  const condoId = await gateCondo(user);
  if (!condoId) return { error: "Escolha um condomínio no menu." };

  const kind = String(form.get("kind") ?? "");
  const unitId = String(form.get("unitId") ?? "");
  const name = clip(form.get("name"), 120);
  if (!isPersonKind(kind)) return { error: "Escolha o tipo." };
  if (!name || name.length < 2) return { error: "Informe o nome." };
  const until = String(form.get("validUntil") ?? "");
  if (until && !isDay(until)) return { error: "Data de validade inválida." };
  const unit = await db.unit.findFirst({ where: { id: unitId, building: { condominiumId: condoId } }, select: { id: true } });
  if (!unit) return { error: "Escolha a unidade." };
  if (!personAccess(user, unitId, condoId, kind)) return { error: "Sem permissão para cadastrar este tipo de pessoa nesta unidade." };

  const data = {
    kind, unitId, name,
    document: clip(form.get("document"), 40),
    phone: clip(form.get("phone"), 30),
    company: kind === "provider" ? clip(form.get("company"), 120) : null,
    notes: clip(form.get("notes"), 500),
    validUntil: kind !== "resident" && until ? new Date(`${until}T00:00:00-03:00`) : null,
  };

  if (id) {
    const old = await db.unitPerson.findFirst({ where: { id, condominiumId: condoId } });
    if (!old || !personAccess(user, old.unitId, condoId, old.kind)) return { error: "Sem permissão." };
    await db.unitPerson.update({ where: { id }, data });
    await audit(user, "update", "unit_person", id, { old: { nome: old.name, tipo: old.kind }, new: { nome: name, tipo: kind }, condominiumId: condoId });
    refresh();
    return { ok: true, message: `${name} atualizado(a).` };
  }
  const p = await db.unitPerson.create({ data: { ...data, condominiumId: condoId, createdById: user.id } });
  await audit(user, "create", "unit_person", p.id, { new: { nome: name, tipo: PERSON_KINDS[kind].label }, condominiumId: condoId });
  refresh();
  return { ok: true, message: `${name} cadastrado(a).` };
}

export async function deletePerson(id: string) {
  const user = await requireUser();
  if (user.impersonator) return;
  const condoId = await gateCondo(user);
  if (!condoId) return;
  const p = await db.unitPerson.findFirst({ where: { id, condominiumId: condoId } });
  if (!p || !personAccess(user, p.unitId, condoId, p.kind)) return;
  await db.unitPerson.delete({ where: { id } });
  await audit(user, "delete", "unit_person", id, { old: { nome: p.name, tipo: p.kind }, condominiumId: condoId });
  refresh();
}

/** Portaria registra uma entrada: de alguém cadastrado (personId) ou digitado na hora. Avisa quem mora na unidade. */
export async function registerEntry(_prev: PortariaState, form: FormData): Promise<PortariaState> {
  const user = await requireUser(...(["superadmin", "syndic", "caretaker", "doorman"] as const));
  if (user.impersonator) return { error: "Indisponível em modo de visualização." };
  const condoId = await gateCondo(user);
  if (!condoId || !isGate(user.role)) return { error: "Escolha um condomínio no menu." };

  const personId = String(form.get("personId") ?? "") || null;
  let entry: { unitId: string | null; kind: string; name: string; document: string | null; personId: string | null };
  if (personId) {
    const p = await db.unitPerson.findFirst({ where: { id: personId, condominiumId: condoId } });
    if (!p) return { error: "Pessoa não encontrada." };
    entry = { unitId: p.unitId, kind: p.kind, name: p.name, document: p.document, personId: p.id };
  } else {
    const kind = String(form.get("kind") ?? "visitor");
    const name = clip(form.get("name"), 120);
    const unitId = String(form.get("unitId") ?? "") || null;
    if (!isPersonKind(kind)) return { error: "Escolha o tipo." };
    if (!name || name.length < 2) return { error: "Informe o nome." };
    if (unitId && !(await db.unit.count({ where: { id: unitId, building: { condominiumId: condoId } } }))) return { error: "Unidade inválida." };
    entry = { unitId, kind, name, document: clip(form.get("document"), 40), personId: null };
  }
  const notes = clip(form.get("notes"), 300);
  const e = await db.accessEntry.create({ data: { ...entry, notes, condominiumId: condoId, createdById: user.id, createdBy: user.name } });

  // Guardar o visitante digitado na hora para as próximas visitas
  if (!personId && entry.unitId && form.get("save") === "on") {
    await db.unitPerson.create({ data: { condominiumId: condoId, unitId: entry.unitId, kind: entry.kind, name: entry.name, document: entry.document, createdById: user.id } });
  }
  await audit(user, "entry", "access_entry", e.id, { new: { nome: entry.name, tipo: entry.kind }, condominiumId: condoId });

  if (entry.unitId) {
    const [unit, residents] = await Promise.all([
      db.unit.findUnique({ where: { id: entry.unitId }, include: { building: true } }),
      db.userUnit.findMany({ where: { unitId: entry.unitId }, select: { userId: true } }),
    ]);
    if (unit && residents.length) {
      await notify(
        { condominiumId: condoId, userIds: residents.map((r) => r.userId), exclude: user.id },
        {
          type: "gate_entry",
          vars: { nome: entry.name, tipo: PERSON_KINDS[entry.kind as keyof typeof PERSON_KINDS]?.label ?? "Visitante", unidade: unitLabel(unit), autor: user.name, hora: brtParts(e.createdAt).hm },
          referenceType: "unit",
          referenceId: entry.unitId,
        },
      );
    }
  }
  refresh();
  return { ok: true, message: `Entrada de ${entry.name} registrada.` };
}

/** Portaria registra a saída (tira da lista "No condomínio agora"). */
export async function markExit(entryId: string) {
  const user = await requireUser(...(["superadmin", "syndic", "caretaker", "doorman"] as const));
  if (user.impersonator) return;
  const condoId = await gateCondo(user);
  if (!condoId) return;
  await db.accessEntry.updateMany({ where: { id: entryId, condominiumId: condoId, exitedAt: null }, data: { exitedAt: new Date(), exitedById: user.id } });
  refresh();
}
