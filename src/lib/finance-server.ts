import "server-only";
import { headers } from "next/headers";
import { db } from "./db";
import type { CurrentUser } from "./auth";

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
  return db.condominium.findUnique({ where: { id }, select: { id: true, name: true, councilFinanceAccess: true } });
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

/** Intervalo de um mês (YYYY-MM) ou de um ano (YYYY) no fuso de Brasília. */
export function financePeriod(sp: Record<string, string | string[] | undefined>) {
  const now = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
  const ano = typeof sp.ano === "string" && /^\d{4}$/.test(sp.ano) ? sp.ano : null;
  if (ano) {
    return { kind: "year" as const, key: ano, from: new Date(`${ano}-01-01T00:00:00-03:00`), to: new Date(`${Number(ano) + 1}-01-01T00:00:00-03:00`) };
  }
  const mes = typeof sp.mes === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.mes) ? sp.mes : now;
  const [y, m] = mes.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return { kind: "month" as const, key: mes, from: new Date(`${mes}-01T00:00:00-03:00`), to: new Date(`${next}-01T00:00:00-03:00`) };
}

export function shiftMonth(mes: string, delta: number) {
  const [y, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}
