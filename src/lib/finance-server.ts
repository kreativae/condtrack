import "server-only";
import { headers } from "next/headers";
import { db } from "./db";
import type { Prisma } from "@prisma/client";
import type { CurrentUser } from "./auth";
import { FIN_TYPES, fmtDayBR } from "./finance";

// Regras de acesso e histórico do Financeiro.
// - Superadmin: todos os condomínios, tudo.
// - Síndico: o próprio condomínio, tudo (inclusive liberar o conselho).
// - Conselho: só visualiza, e só quando o síndico/superadmin liberou.
// - Demais perfis: sem acesso.

export type FinanceAccess = { view: boolean; edit: boolean; manageAccess: boolean };
const NONE: FinanceAccess = { view: false, edit: false, manageAccess: false };

export function financeAccess(user: CurrentUser, condo: { id: string; councilFinanceAccess: boolean }): FinanceAccess {
  if (user.role === "superadmin") return { view: true, edit: true, manageAccess: true };
  if (user.condominiumId !== condo.id) return NONE;
  if (user.role === "syndic") return { view: true, edit: true, manageAccess: true };
  if (user.role === "council") return { view: condo.councilFinanceAccess, edit: false, manageAccess: false };
  return NONE;
}

/** O conselho só vê o menu Financeiro quando o acesso está liberado. */
export function showFinanceNav(user: CurrentUser) {
  if (user.role === "superadmin" || user.role === "syndic") return true;
  return user.role === "council" && !!user.condominium?.councilFinanceAccess;
}

/** Condomínio do Financeiro: o próprio, ou o escolhido pelo superadmin (?condo=). */
export async function financeCondo(user: CurrentUser, condoParam: unknown) {
  const id = user.role === "superadmin" ? (typeof condoParam === "string" ? condoParam : null) : user.condominiumId;
  if (!id) return null;
  return db.condominium.findFirst({ where: { id, deletedAt: null }, select: { id: true, name: true, councilFinanceAccess: true } });
}

/** Lançamento + checagem de acesso (null = não existe ou sem permissão). */
export async function loadEntryFor(user: CurrentUser, id: string) {
  const entry = await db.financeEntry.findUnique({ where: { id }, include: { condominium: { select: { id: true, name: true, councilFinanceAccess: true } } } });
  if (!entry) return null;
  const access = financeAccess(user, entry.condominium);
  if (!access.view) return null;
  // Excluídos só aparecem para quem pode editar (para consultar ou restaurar)
  if (entry.deletedAt && !access.edit) return null;
  return { entry, access };
}

export async function financeLog(
  user: CurrentUser,
  data: { condominiumId: string; entryId?: string | null; attachmentId?: string | null; action: string; changes?: unknown },
) {
  const h = await headers();
  await db.financeLog.create({
    data: {
      condominiumId: data.condominiumId,
      entryId: data.entryId ?? null,
      attachmentId: data.attachmentId ?? null,
      userId: user.id,
      // Em "visualizar como", registra também quem estava por trás
      userName: user.impersonator ? `${user.name} (sessão de ${user.impersonator.name})` : user.name,
      userRole: user.role,
      action: data.action,
      changes: JSON.stringify(data.changes ?? {}),
      ipAddress: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip"),
    },
  });
}

const VIEW_WINDOW = 10 * 60_000;

/** Registra uma visualização (no máximo uma a cada 10 min por pessoa e item). */
export async function logView(user: CurrentUser, data: { condominiumId: string; entryId: string; attachmentId?: string; action: "viewed" | "attachment_viewed"; changes?: unknown }) {
  const recent = await db.financeLog.findFirst({
    where: { entryId: data.entryId, userId: user.id, action: data.action, attachmentId: data.attachmentId ?? null, createdAt: { gte: new Date(Date.now() - VIEW_WINDOW) } },
    select: { id: true },
  });
  if (!recent) await financeLog(user, data);
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const validDay = (v: unknown): v is string => typeof v === "string" && DAY.test(v) && !Number.isNaN(new Date(`${v}T12:00:00-03:00`).getTime());

/** Intervalo livre (de/até YYYY-MM-DD), de um mês (YYYY-MM) ou de um ano (YYYY), no fuso de Brasília. */
/** Mês atual (AAAA-MM) no fuso de Brasília. */
export function currentMonthKey() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
}

export function financePeriod(sp: Record<string, string | string[] | undefined>) {
  if (validDay(sp.de) && validDay(sp.ate)) {
    const [a, b] = sp.de <= sp.ate ? [sp.de, sp.ate] : [sp.ate, sp.de];
    const end = new Date(`${b}T00:00:00-03:00`);
    end.setUTCDate(end.getUTCDate() + 1);
    return { kind: "range" as const, key: `${a}_${b}`, label: `${fmtDayBR(`${a}T12:00:00-03:00`)} a ${fmtDayBR(`${b}T12:00:00-03:00`)}`, from: new Date(`${a}T00:00:00-03:00`), to: end };
  }
  const now = currentMonthKey();
  const ano = typeof sp.ano === "string" && /^\d{4}$/.test(sp.ano) ? sp.ano : null;
  if (ano) {
    return { kind: "year" as const, key: ano, label: `Ano de ${ano}`, from: new Date(`${ano}-01-01T00:00:00-03:00`), to: new Date(`${Number(ano) + 1}-01-01T00:00:00-03:00`) };
  }
  const mes = typeof sp.mes === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.mes) ? sp.mes : now;
  const [y, m] = mes.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return { kind: "month" as const, key: mes, label: `${MONTHS[m - 1]} de ${y}`, from: new Date(`${mes}-01T00:00:00-03:00`), to: new Date(`${next}-01T00:00:00-03:00`) };
}

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export const REPORT_STATUS = { paid: "Pagos", pending: "Pendentes", overdue: "Vencidos", cancelled: "Cancelados" } as const;

/**
 * Filtros do relatório (tipo, situação, categorias) a partir da URL.
 * Categorias vêm separadas por "|" (nomes podem ter vírgula).
 */
export function financeReportFilter(sp: Record<string, string | string[] | undefined>, now: Date) {
  const tipo = typeof sp.tipo === "string" && sp.tipo in FIN_TYPES ? (sp.tipo as keyof typeof FIN_TYPES) : null;
  const situacao = typeof sp.situacao === "string" && sp.situacao in REPORT_STATUS ? (sp.situacao as keyof typeof REPORT_STATUS) : null;
  const cats = typeof sp.cats === "string" && sp.cats ? sp.cats.split("|").map((c) => c.trim()).filter(Boolean).slice(0, 60) : [];
  const where: Prisma.FinanceEntryWhereInput = {
    ...(tipo && { type: tipo }),
    ...(situacao === "overdue" ? { status: "pending", dueDate: { lt: now } } : situacao ? { status: situacao } : {}),
    ...(cats.length && { category: { in: cats } }),
  };
  const labels = [
    tipo ? `Somente ${FIN_TYPES[tipo].toLowerCase()}s` : null,
    situacao ? REPORT_STATUS[situacao] : null,
    cats.length ? `Categorias: ${cats.join(", ")}` : null,
  ].filter((x): x is string => !!x);
  return { where, labels, filtered: labels.length > 0 };
}

export function shiftMonth(mes: string, delta: number) {
  const [y, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}
