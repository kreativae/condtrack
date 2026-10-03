import "server-only";
import type { MaintenancePlan } from "@prisma/client";
import { db } from "./db";
import { notify } from "./notify";
import { nextProtocol } from "./orders";
import { inCondo } from "./memberships";
import { addDays, spNow } from "./checklist";
import { advance, daysBetween, fmtDay } from "./maintenance";

// Manutenção preventiva: abre as OS dos serviços recorrentes e avisa o vencimento dos documentos.
// Roda pelo agendamento (/api/cron/checklist, a cada 15 min) e ao abrir a página.

/** Próximo vencimento depois de abrir a OS: pula ciclos atrasados para não abrir várias de uma vez. */
function nextAfter(p: Pick<MaintenancePlan, "nextDue" | "every" | "unit" | "leadDays">, today: string) {
  let next = advance(p.nextDue, p.every, p.unit);
  for (let i = 0; i < 1000 && daysBetween(today, next) <= p.leadDays; i++) next = advance(next, p.every, p.unit);
  return next;
}

/**
 * Abre a OS do ciclo atual de um serviço recorrente e agenda o próximo.
 * `actor`: quem pediu (botão "Abrir OS agora"); sem ele, é a abertura automática.
 */
export async function openPlanOrder(planId: string, actor?: { id: string; name: string }) {
  const p = await db.maintenancePlan.findUnique({ where: { id: planId } });
  if (!p || p.kind !== "service") return null;
  const today = spNow(Date.now()).date;

  // Reserva o ciclo: só quem trocar a data primeiro abre a OS
  const claim = await db.maintenancePlan.updateMany({ where: { id: p.id, nextDue: p.nextDue }, data: { nextDue: nextAfter(p, today) } });
  if (!claim.count) return null;

  const provider = p.providerId ? await db.user.findFirst({ where: { id: p.providerId, status: "active", ...inCondo(p.condominiumId, ["provider"]) } }) : null;
  const area = p.commonAreaId ? await db.commonArea.findFirst({ where: { id: p.commonAreaId, condominiumId: p.condominiumId }, select: { id: true } }) : null;
  const now = new Date();
  const origin = actor ? `Aberta por ${actor.name} a partir da manutenção preventiva.` : "Aberta automaticamente pela manutenção preventiva.";

  const order = await db.$transaction(async (tx) => {
    const protocol = await nextProtocol(p.condominiumId, tx);
    const o = await tx.serviceOrder.create({
      data: {
        protocol,
        condominiumId: p.condominiumId,
        title: p.title,
        description: [p.description, `Manutenção preventiva · ciclo de ${fmtDay(p.nextDue)}.`].filter(Boolean).join("\n\n"),
        categoryId: p.categoryId,
        priority: p.priority,
        locationType: "common_area",
        commonAreaId: area?.id ?? null,
        dueDate: new Date(`${p.nextDue}T18:00:00-03:00`),
        requestedById: actor?.id ?? p.createdById,
        status: provider ? "assigned" : "open",
        assignedToId: provider?.id ?? null,
        assignedAt: provider ? now : null,
      },
    });
    await tx.serviceEvent.create({ data: { serviceOrderId: o.id, userId: actor?.id ?? null, type: "created", toStatus: "open", comment: origin } });
    if (provider) {
      await tx.serviceEvent.create({
        data: { serviceOrderId: o.id, userId: actor?.id ?? null, type: "assignment", fromStatus: "open", toStatus: "assigned", comment: `Atribuída a ${provider.name}${provider.company ? ` (${provider.company})` : ""} (prestador do plano).` },
      });
    }
    await tx.maintenancePlan.update({ where: { id: p.id }, data: { lastOrderId: o.id } });
    return o;
  });

  const link = { referenceType: "service_order", referenceId: order.id };
  await notify(
    { condominiumId: p.condominiumId, roles: ["syndic", "caretaker"], exclude: actor?.id },
    { type: "maint_order", vars: { protocolo: order.protocol, titulo: order.title, vencimento: fmtDay(p.nextDue) }, ...link },
  );
  if (provider) {
    await notify(
      { condominiumId: p.condominiumId, userIds: [provider.id] },
      { type: "os_assigned", vars: { protocolo: order.protocol, titulo: order.title, autor: actor?.name ?? "Manutenção preventiva", prestador: provider.name }, ...link },
    );
  }
  return order;
}

/** Avisa o síndico do vencimento de um documento (uma vez antes e uma vez no vencimento). */
async function alertDocument(p: MaintenancePlan, today: string) {
  const days = daysBetween(today, p.nextDue);
  const expired = days <= 0;
  const mark = expired ? `${p.nextDue}!` : p.nextDue;
  if (p.alertedFor === mark || (!expired && p.alertedFor === `${p.nextDue}!`)) return;
  const claim = await db.maintenancePlan.updateMany({ where: { id: p.id, alertedFor: p.alertedFor }, data: { alertedFor: mark } });
  if (!claim.count) return;
  await notify(
    { condominiumId: p.condominiumId, roles: ["syndic"] },
    {
      type: expired ? "maint_doc_expired" : "maint_doc_expiring",
      vars: { documento: p.title, vencimento: fmtDay(p.nextDue), dias: days },
      referenceType: "maintenance",
      referenceId: p.id,
    },
  );
}

/** Verifica os planos ativos (de um condomínio ou de todos) e age no que venceu a antecedência. */
export async function runMaintenance(nowMs: number, condominiumId?: string) {
  const today = spNow(nowMs).date;
  const plans = await db.maintenancePlan.findMany({
    where: { active: true, nextDue: { lte: addDays(today, 366) }, condominium: { active: true }, ...(condominiumId ? { condominiumId } : {}) },
  });
  let opened = 0;
  for (const p of plans) {
    if (daysBetween(today, p.nextDue) > p.leadDays) continue;
    try {
      if (p.kind === "service") opened += (await openPlanOrder(p.id)) ? 1 : 0;
      else await alertDocument(p, today);
    } catch (e) {
      console.error(`[manutenção] plano ${p.id}`, e);
    }
  }
  return { plans: plans.length, opened };
}
