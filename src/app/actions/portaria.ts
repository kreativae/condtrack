"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser, type CurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { unitLabel } from "@/lib/units";
import { PERSON_KINDS, brt, brtParts, docKey, grantStatus, isDay, isGate, isHM, isPersonKind, parseWeekdays } from "@/lib/booking";
import { findOrCreatePerson, gateCondo, grantAccess, myUnits } from "@/lib/booking-server";

export type PortariaState = { error?: string; ok?: boolean; message?: string; personId?: string } | undefined;

const GATE = ["superadmin", "syndic", "caretaker", "doorman"] as const;
const clip = (v: FormDataEntryValue | null, n: number) => String(v ?? "").trim().slice(0, n) || null;

function refresh(personId?: string) {
  revalidatePath("/minha-unidade");
  revalidatePath("/portaria");
  if (personId) revalidatePath(`/portaria/pessoa/${personId}`);
}

/** Campos da autorização (tipo, dias, horário, prazo, observação) a partir do formulário. */
function grantFields(form: FormData) {
  const kind = String(form.get("kind") ?? "");
  if (!isPersonKind(kind)) return { error: "Escolha o tipo." } as const;
  const from = String(form.get("validFrom") ?? "");
  const until = String(form.get("validUntil") ?? "");
  if ((from && !isDay(from)) || (until && !isDay(until))) return { error: "Data inválida." } as const;
  if (from && until && until < from) return { error: "A data final é antes da inicial." } as const;
  const timeFrom = String(form.get("timeFrom") ?? "");
  const timeTo = String(form.get("timeTo") ?? "");
  if (!!timeFrom !== !!timeTo || (timeFrom && (!isHM(timeFrom) || !isHM(timeTo)))) return { error: "Informe o horário de entrada e de saída (ou deixe os dois vazios)." } as const;
  const resident = kind === "resident";
  return {
    data: {
      kind,
      weekdays: resident ? "" : parseWeekdays(form.getAll("weekdays").join(",")).join(","),
      timeFrom: resident ? null : timeFrom || null,
      timeTo: resident ? null : timeTo || null,
      validFrom: resident || !from ? null : brt(from, "00:00"),
      validUntil: resident || !until ? null : brt(until, "00:00"),
      notes: clip(form.get("notes"), 500),
    },
  } as const;
}

/** Destino do formulário: unidade do condomínio ou "" (condomínio, só para quem atende). */
async function unitOf(condoId: string, raw: FormDataEntryValue | null) {
  const unitId = String(raw ?? "") || null;
  if (!unitId) return { unitId: null };
  const ok = await db.unit.count({ where: { id: unitId, building: { condominiumId: condoId } } });
  return ok ? { unitId } : { error: "Unidade inválida." };
}

/** Pessoas que só a unidade do morador autorizou podem ter os dados editados por ele. */
async function canEditPerson(user: CurrentUser, condoId: string, personId: string) {
  if (isGate(user.role)) return true;
  const units = myUnits(user, condoId).map((u) => u.id);
  const grants = await db.accessGrant.findMany({ where: { personId }, select: { unitId: true } });
  return grants.length > 0 && grants.every((g) => g.unitId && units.includes(g.unitId));
}

/**
 * Nova autorização: acha a pessoa pelo documento (ou cria) e autoriza para a unidade (ou o condomínio).
 * Usado pelo morador (Minha unidade) e pela portaria.
 */
export async function createGrant(_prev: PortariaState, form: FormData): Promise<PortariaState> {
  const user = await requireUser();
  if (user.impersonator) return { error: "Indisponível em modo de visualização." };
  const condoId = await gateCondo(user);
  if (!condoId) return { error: "Escolha um condomínio no menu." };
  // Pela ficha (portaria): a autorização é da própria pessoa, mesmo sem documento
  const fixedPerson = String(form.get("personId") ?? "") && isGate(user.role)
    ? await db.accessPerson.findFirst({ where: { id: String(form.get("personId")), condominiumId: condoId } })
    : null;
  const name = fixedPerson?.name ?? clip(form.get("name"), 120);
  if (!name || name.length < 2) return { error: "Informe o nome." };
  const f = grantFields(form);
  if ("error" in f) return { error: f.error };
  const u = await unitOf(condoId, form.get("unitId"));
  if ("error" in u) return { error: u.error };
  if (!u.unitId && !isGate(user.role)) return { error: "Escolha a unidade." };
  if (!grantAccess(user, condoId, u.unitId, f.data.kind)) return { error: "Sem permissão para esse tipo de autorização nesta unidade." };

  const { person, existed } = fixedPerson
    ? { person: fixedPerson, existed: true }
    : await findOrCreatePerson(condoId, { name, document: clip(form.get("document"), 40), phone: clip(form.get("phone"), 30), company: clip(form.get("company"), 120) }, user.id);
  if (person.blockedAt && !isGate(user.role)) return { error: "Essa pessoa está com a entrada impedida pela administração. Fale com a portaria." };
  const g = await db.accessGrant.create({ data: { ...f.data, condominiumId: condoId, personId: person.id, unitId: u.unitId, createdById: user.id, createdByName: user.name } });
  await audit(user, "create", "access_grant", g.id, { new: { pessoa: person.name, tipo: PERSON_KINDS[f.data.kind as keyof typeof PERSON_KINDS].label, unidade: u.unitId ?? "condomínio" }, condominiumId: condoId });
  refresh(person.id);
  if (form.get("open") === "1") redirect(`/portaria/pessoa/${person.id}`);
  return {
    ok: true,
    personId: person.id,
    message: existed && !fixedPerson && person.name !== name ? `${person.name} já estava cadastrado(a) com esse documento; a autorização foi adicionada.` : `${person.name} autorizado(a).`,
  };
}

/** Edita a autorização (e, quando pode, os dados da pessoa). */
export async function updateGrant(id: string, _prev: PortariaState, form: FormData): Promise<PortariaState> {
  const user = await requireUser();
  if (user.impersonator) return { error: "Indisponível em modo de visualização." };
  const condoId = await gateCondo(user);
  if (!condoId) return { error: "Escolha um condomínio no menu." };
  const g = await db.accessGrant.findFirst({ where: { id, condominiumId: condoId } });
  if (!g || !grantAccess(user, condoId, g.unitId, g.kind)) return { error: "Sem permissão." };
  const f = grantFields(form);
  if ("error" in f) return { error: f.error };
  if (!grantAccess(user, condoId, g.unitId, f.data.kind)) return { error: "Sem permissão para esse tipo." };
  await db.accessGrant.update({ where: { id }, data: f.data });
  if (await canEditPerson(user, condoId, g.personId)) {
    const name = clip(form.get("name"), 120);
    if (name && name.length >= 2) {
      const document = clip(form.get("document"), 40);
      const key = docKey(document);
      const clash = key ? await db.accessPerson.findFirst({ where: { condominiumId: condoId, docKey: key, id: { not: g.personId } } }) : null;
      if (clash) return { error: `Esse documento já é de ${clash.name}.` };
      await db.accessPerson.update({ where: { id: g.personId }, data: { name, document, docKey: key, phone: clip(form.get("phone"), 30), company: clip(form.get("company"), 120) } });
    }
  }
  await audit(user, "update", "access_grant", id, { new: { tipo: f.data.kind }, condominiumId: condoId });
  refresh(g.personId);
  return { ok: true, message: "Autorização atualizada." };
}

/** Revoga a autorização. A pessoa some se não tiver mais nada (nem autorizações, nem entradas). */
export async function deleteGrant(id: string) {
  const user = await requireUser();
  if (user.impersonator) return;
  const condoId = await gateCondo(user);
  if (!condoId) return;
  const g = await db.accessGrant.findFirst({ where: { id, condominiumId: condoId }, include: { person: { select: { name: true } } } });
  if (!g || !grantAccess(user, condoId, g.unitId, g.kind)) return;
  await db.accessGrant.delete({ where: { id } });
  const left = await db.accessPerson.findUnique({ where: { id: g.personId }, select: { blockedAt: true, _count: { select: { grants: true, entries: true } } } });
  if (left && !left.blockedAt && !left._count.grants && !left._count.entries) await db.accessPerson.delete({ where: { id: g.personId } });
  await audit(user, "delete", "access_grant", id, { old: { pessoa: g.person.name, tipo: g.kind, unidade: g.unitId ?? "condomínio" }, condominiumId: condoId });
  refresh(g.personId);
}

/** Portaria: dados da pessoa (nome, documento, telefone, empresa, observações). */
export async function updatePerson(id: string, _prev: PortariaState, form: FormData): Promise<PortariaState> {
  const user = await requireUser(...GATE);
  if (user.impersonator) return { error: "Indisponível em modo de visualização." };
  const condoId = await gateCondo(user);
  const p = condoId ? await db.accessPerson.findFirst({ where: { id, condominiumId: condoId } }) : null;
  if (!p || !condoId) return { error: "Pessoa não encontrada." };
  const name = clip(form.get("name"), 120);
  if (!name || name.length < 2) return { error: "Informe o nome." };
  const document = clip(form.get("document"), 40);
  const key = docKey(document);
  const clash = key ? await db.accessPerson.findFirst({ where: { condominiumId: condoId, docKey: key, id: { not: id } } }) : null;
  if (clash) return { error: `Esse documento já é de ${clash.name}.` };
  const data = { name, document, docKey: key, phone: clip(form.get("phone"), 30), company: clip(form.get("company"), 120), notes: clip(form.get("notes"), 500) };
  await db.accessPerson.update({ where: { id }, data });
  await audit(user, "update", "access_person", id, { old: { nome: p.name, documento: p.document }, new: { nome: name, documento: document }, condominiumId: condoId });
  refresh(id);
  return { ok: true, message: "Dados salvos." };
}

/** Impedir ou liberar a entrada (motivo obrigatório para impedir). */
export async function setBlocked(id: string, blocked: boolean, _prev: PortariaState, form: FormData): Promise<PortariaState> {
  const user = await requireUser(...GATE);
  if (user.impersonator) return { error: "Indisponível em modo de visualização." };
  const condoId = await gateCondo(user);
  const p = condoId ? await db.accessPerson.findFirst({ where: { id, condominiumId: condoId } }) : null;
  if (!p || !condoId) return { error: "Pessoa não encontrada." };
  const reason = clip(form.get("reason"), 300);
  if (blocked && (!reason || reason.length < 3)) return { error: "Diga o motivo." };
  await db.accessPerson.update({ where: { id }, data: blocked ? { blockedAt: new Date(), blockedReason: reason, blockedById: user.id } : { blockedAt: null, blockedReason: null, blockedById: null } });
  await audit(user, blocked ? "block" : "unblock", "access_person", id, { new: { nome: p.name, motivo: reason ?? undefined }, condominiumId: condoId });
  refresh(id);
  return { ok: true, message: blocked ? "Entrada impedida." : "Entrada liberada." };
}

/**
 * Registra uma entrada: pessoa cadastrada (personId) ou digitada na hora, para uma ou várias unidades
 * (vazio = condomínio). Cada unidade de destino é avisada; quem não estava autorizado para hoje vem marcado.
 */
export async function registerEntry(_prev: PortariaState, form: FormData): Promise<PortariaState> {
  const user = await requireUser(...GATE);
  if (user.impersonator) return { error: "Indisponível em modo de visualização." };
  const condoId = await gateCondo(user);
  if (!condoId) return { error: "Escolha um condomínio no menu." };

  const unitIds = [...new Set(form.getAll("unitIds").map(String).filter(Boolean))].slice(0, 20);
  if (unitIds.length && (await db.unit.count({ where: { id: { in: unitIds }, building: { condominiumId: condoId } } })) !== unitIds.length) return { error: "Unidade inválida." };
  const notes = clip(form.get("notes"), 300);

  let personId = String(form.get("personId") ?? "") || null;
  let name: string;
  let document: string | null;
  let kind = String(form.get("kind") ?? "visitor");
  if (personId) {
    const p = await db.accessPerson.findFirst({ where: { id: personId, condominiumId: condoId }, include: { grants: true } });
    if (!p) return { error: "Pessoa não encontrada." };
    if (p.blockedAt) return { error: `Entrada impedida: ${p.blockedReason ?? "sem motivo informado"}.` };
    name = p.name;
    document = p.document;
    // Tipo: o da autorização de um dos destinos (ou a primeira)
    kind = (p.grants.find((g) => unitIds.includes(g.unitId ?? "")) ?? p.grants[0])?.kind ?? kind;
  } else {
    name = clip(form.get("name"), 120) ?? "";
    document = clip(form.get("document"), 40);
    if (name.length < 2) return { error: "Informe o nome." };
    if (!isPersonKind(kind) || kind === "resident") kind = "visitor";
    const key = docKey(document);
    const known = key ? await db.accessPerson.findUnique({ where: { condominiumId_docKey: { condominiumId: condoId, docKey: key } } }) : null;
    if (known?.blockedAt) return { error: `${known.name} está com a entrada impedida: ${known.blockedReason ?? "sem motivo informado"}.` };
    if (known) personId = known.id;
    else if (form.get("save") === "on") personId = (await findOrCreatePerson(condoId, { name, document, phone: clip(form.get("phone"), 30), company: clip(form.get("company"), 120) }, user.id)).person.id;
  }

  const e = await db.accessEntry.create({
    data: {
      condominiumId: condoId, unitId: unitIds[0] ?? null, personId, kind, name, document, notes, createdById: user.id, createdBy: user.name,
      dests: { create: unitIds.map((unitId) => ({ unitId })) },
    },
  });
  await audit(user, "entry", "access_entry", e.id, { new: { nome: name, tipo: kind, destinos: unitIds.length || "condomínio" }, condominiumId: condoId });

  if (unitIds.length) {
    const [units, residents, grants] = await Promise.all([
      db.unit.findMany({ where: { id: { in: unitIds } }, include: { building: true } }),
      db.userUnit.findMany({ where: { unitId: { in: unitIds } }, select: { userId: true, unitId: true } }),
      personId ? db.accessGrant.findMany({ where: { personId, unitId: { in: unitIds } } }) : [],
    ]);
    const hora = brtParts(e.createdAt).hm;
    for (const u of units) {
      const to = residents.filter((r) => r.unitId === u.id).map((r) => r.userId);
      if (!to.length) continue;
      const authorized = grants.some((g) => g.unitId === u.id && grantStatus(g) === "today");
      await notify(
        { condominiumId: condoId, userIds: to, exclude: user.id },
        {
          type: "gate_entry",
          vars: { nome: name, tipo: PERSON_KINDS[kind as keyof typeof PERSON_KINDS]?.label ?? "Visitante", unidade: unitLabel(u), autor: user.name, hora, aviso: authorized ? "" : "Não estava autorizado(a) para hoje: avise a portaria se não reconhecer." },
          referenceType: "unit",
          referenceId: u.id,
        },
      );
    }
  }
  refresh(personId ?? undefined);
  return { ok: true, message: `Entrada de ${name} registrada.` };
}

/** Portaria registra a saída (tira da lista "No condomínio agora"). */
export async function markExit(entryId: string) {
  const user = await requireUser(...GATE);
  if (user.impersonator) return;
  const condoId = await gateCondo(user);
  if (!condoId) return;
  await db.accessEntry.updateMany({ where: { id: entryId, condominiumId: condoId, exitedAt: null }, data: { exitedAt: new Date(), exitedById: user.id } });
  refresh();
}
