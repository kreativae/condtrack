import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { ACTIVE_STATUSES, STATUSES } from "./workflow";

const DAY = 86400_000;

/** Métricas de OS para um escopo (condomínio, prestador ou global). */
export async function orderMetrics(where: Prisma.ServiceOrderWhereInput) {
  const since = new Date(Date.now() - 30 * DAY);
  const [byStatus, overdue, approved30, resolved] = await Promise.all([
    db.serviceOrder.groupBy({ by: ["status"], where, _count: true }),
    db.serviceOrder.count({ where: { ...where, status: { in: ACTIVE_STATUSES }, dueDate: { lt: new Date() } } }),
    db.serviceOrder.count({ where: { ...where, status: "approved", approvedAt: { gte: since } } }),
    db.serviceOrder.findMany({ where: { ...where, status: "approved", approvedAt: { not: null } }, select: { createdAt: true, approvedAt: true }, take: 500, orderBy: { approvedAt: "desc" } }),
  ]);
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<(typeof STATUSES)[number], number>;
  byStatus.forEach((r) => (counts[r.status as keyof typeof counts] = r._count));
  const open = ACTIVE_STATUSES.reduce((a, s) => a + counts[s], 0);
  const avgHours = resolved.length
    ? resolved.reduce((a, r) => a + (r.approvedAt!.getTime() - r.createdAt.getTime()), 0) / resolved.length / 3600_000
    : null;
  return { counts, open, overdue, approved30, avgHours, total: Object.values(counts).reduce((a, b) => a + b, 0) };
}

export function fmtHours(h: number | null) {
  if (h == null) return "—";
  return h >= 48 ? `${(h / 24).toFixed(1)}d` : `${Math.round(h)}h`;
}
