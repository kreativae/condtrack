import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { ACTIVE_STATUSES } from "./workflow";

// Relatório de serviços de um condomínio num período (prestação de contas em assembleia).
// Datas no fuso de Brasília (sem horário de verão desde 2019: -03:00 fixo).

const TZ = "America/Sao_Paulo";
const OFFSET = "-03:00";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const validDay = (v: unknown): v is string => typeof v === "string" && DATE_RE.test(v) && !Number.isNaN(new Date(`${v}T12:00:00${OFFSET}`).getTime());

export const PERIOD_PRESETS = [
  { key: "mes", label: "Este mês" },
  { key: "mes-anterior", label: "Mês passado" },
  { key: "trimestre", label: "Últimos 3 meses" },
  { key: "semestre", label: "Últimos 6 meses" },
  { key: "ano", label: "Este ano" },
  { key: "personalizado", label: "Personalizado" },
] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number]["key"];

/** Data de hoje (YYYY-MM-DD) em Brasília. */
export function todayBR() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

const iso = (y: number, m: number, d: number) => {
  // m pode sair de 1..12 (ex.: 0 ou -2): Date.UTC normaliza
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toISOString().slice(0, 10);
};

/** Período a partir dos parâmetros da URL (preset ou de/até). */
export function parsePeriod(sp: Record<string, string | string[] | undefined>) {
  const today = todayBR();
  const [y, m] = today.split("-").map(Number);
  const preset = (PERIOD_PRESETS.some((p) => p.key === sp.periodo) ? sp.periodo : "mes") as PeriodPreset;
  let de: string;
  let ate: string;
  switch (preset) {
    case "mes-anterior":
      de = iso(y, m - 1, 1);
      ate = iso(y, m, 0); // dia 0 do mês atual = último dia do anterior
      break;
    case "trimestre":
      de = iso(y, m - 2, 1);
      ate = today;
      break;
    case "semestre":
      de = iso(y, m - 5, 1);
      ate = today;
      break;
    case "ano":
      de = `${y}-01-01`;
      ate = today;
      break;
    case "personalizado": {
      const a = validDay(sp.de) ? sp.de : iso(y, m, 1);
      const b = validDay(sp.ate) ? sp.ate : today;
      [de, ate] = a <= b ? [a, b] : [b, a];
      break;
    }
    default:
      de = iso(y, m, 1);
      ate = today;
  }
  return {
    preset,
    de,
    ate,
    from: new Date(`${de}T00:00:00.000${OFFSET}`),
    to: new Date(`${ate}T23:59:59.999${OFFSET}`),
  };
}
export type Period = ReturnType<typeof parsePeriod>;

export function fmtDay(ymd: string) {
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

const approvedInclude = {
  category: true,
  commonArea: true,
  unit: { include: { building: true } },
  assignedTo: { select: { name: true, company: true } },
  requestedBy: { select: { name: true } },
  validatedBy: { select: { name: true } },
  approvedBy: { select: { name: true } },
  media: { where: { type: "photo", phase: { in: ["opening", "before", "after"] } }, orderBy: { uploadedAt: "asc" } },
} satisfies Prisma.ServiceOrderInclude;

export type ReportOrder = Prisma.ServiceOrderGetPayload<{ include: typeof approvedInclude }>;

export async function loadReport(condominiumId: string, p: Period) {
  const inRange = { gte: p.from, lte: p.to };
  const scope = { condominiumId };
  const [condo, approved, opened, rejections, cancellations, pending] = await Promise.all([
    db.condominium.findUniqueOrThrow({ where: { id: condominiumId }, select: { name: true, address: true, cnpj: true, logoUrl: true } }),
    db.serviceOrder.findMany({ where: { ...scope, status: "approved", approvedAt: inRange }, include: approvedInclude, orderBy: { approvedAt: "asc" } }),
    db.serviceOrder.count({ where: { ...scope, createdAt: inRange } }),
    db.serviceEvent.count({ where: { type: "rejection", createdAt: inRange, serviceOrder: scope } }),
    db.serviceEvent.count({ where: { toStatus: "cancelled", createdAt: inRange, serviceOrder: scope } }),
    db.serviceOrder.findMany({
      where: { ...scope, status: { in: ACTIVE_STATUSES }, createdAt: { lte: p.to } },
      select: { id: true, protocol: true, title: true, status: true, priority: true, dueDate: true, createdAt: true, category: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const hours = approved.filter((o) => o.approvedAt).map((o) => (o.approvedAt!.getTime() - o.createdAt.getTime()) / 3600_000);
  const rated = approved.filter((o) => o.rating != null);
  const now = Date.now();

  const group = (key: (o: ReportOrder) => string) => {
    const map = new Map<string, { name: string; count: number; hours: number }>();
    for (const o of approved) {
      const k = key(o);
      const g = map.get(k) ?? { name: k, count: 0, hours: 0 };
      g.count++;
      g.hours += (o.approvedAt!.getTime() - o.createdAt.getTime()) / 3600_000;
      map.set(k, g);
    }
    return [...map.values()].sort((a, b) => b.count - a.count).map((g) => ({ ...g, avgHours: g.hours / g.count }));
  };

  return {
    condo,
    approved,
    pending: pending.map((o) => ({ ...o, overdue: !!o.dueDate && o.dueDate.getTime() < now })),
    summary: {
      opened,
      approved: approved.length,
      rejections,
      cancellations,
      pending: pending.length,
      overdue: pending.filter((o) => o.dueDate && o.dueDate.getTime() < now).length,
      avgHours: hours.length ? hours.reduce((a, b) => a + b, 0) / hours.length : null,
      avgRating: rated.length ? rated.reduce((a, o) => a + o.rating!, 0) / rated.length : null,
      ratedCount: rated.length,
    },
    byCategory: group((o) => o.category?.name ?? "Sem categoria"),
    byProvider: group((o) => (o.assignedTo ? (o.assignedTo.company ? `${o.assignedTo.name} · ${o.assignedTo.company}` : o.assignedTo.name) : "Usuário excluído")),
  };
}
