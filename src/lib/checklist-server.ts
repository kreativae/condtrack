import "server-only";
import { db } from "./db";
import { notify } from "./notify";
import { deadlineMinutes, isDue, spNow } from "./checklist";

/** Itens do dia (ativos e devidos na data, mais os já conferidos) com a conferência de cada um. */
export async function checklistForDay(condominiumId: string, date: string) {
  const items = await db.checklistItem.findMany({
    where: { condominiumId, OR: [{ active: true }, { checks: { some: { date } } }] },
    include: { commonArea: { select: { name: true } }, checks: { where: { date }, include: { user: { select: { name: true } } } } },
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
  });
  return items
    .filter((i) => i.checks.length || isDue(i, date))
    .map(({ checks, ...i }) => ({ ...i, check: checks[0] ?? null }));
}

export type DayItem = Awaited<ReturnType<typeof checklistForDay>>[number];

/**
 * Passou do horário limite e o checklist de hoje não foi concluído: avisa síndico
 * e zelador uma vez por dia. Chamado sem bloquear a página (layout do app) e pela
 * rota /api/cron/checklist. O updateMany garante um único envio mesmo em paralelo.
 */
export async function maybeAlertLate(condominiumId: string, nowMs: number) {
  const c = await db.condominium.findUnique({ where: { id: condominiumId }, select: { checklistDeadline: true, checklistAlertedOn: true } });
  const limit = deadlineMinutes(c?.checklistDeadline);
  if (!c || limit == null) return;
  const now = spNow(nowMs);
  if (now.minutes < limit || c.checklistAlertedOn === now.date) return;

  const claim = await db.condominium.updateMany({
    where: { id: condominiumId, OR: [{ checklistAlertedOn: null }, { checklistAlertedOn: { not: now.date } }] },
    data: { checklistAlertedOn: now.date },
  });
  if (!claim.count) return;

  const items = await checklistForDay(condominiumId, now.date);
  const pending = items.filter((i) => !i.check).length;
  if (!pending) return;
  await notify(
    { condominiumId, roles: ["syndic", "caretaker"] },
    { type: "checklist_late", vars: { pendentes: pending, total: items.length, prazo: c.checklistDeadline }, referenceType: "checklist" },
  );
}

/** Lista do dia já no formato da tela (com o protocolo da OS aberta, se houver). */
export async function dayItemsForUi(condominiumId: string, date: string) {
  const items = await checklistForDay(condominiumId, date);
  const orderIds = items.map((i) => i.check?.serviceOrderId).filter((x): x is string => !!x);
  const orders = orderIds.length ? await db.serviceOrder.findMany({ where: { id: { in: orderIds } }, select: { id: true, protocol: true } }) : [];
  return items.map((i) => ({
    id: i.id,
    title: i.title,
    description: i.description,
    area: i.commonArea?.name ?? null,
    check: i.check && {
      status: i.check.status,
      note: i.check.note,
      photoUrl: i.check.photoUrl,
      by: i.check.user?.name ?? "Usuário excluído",
      at: i.check.checkedAt.toISOString(),
      order: orders.find((o) => o.id === i.check!.serviceOrderId) ?? null,
    },
  }));
}
