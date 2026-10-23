import "server-only";
import { db } from "./db";
import type { CurrentUser } from "./auth";
import { adminScope } from "./admin-scope-server";

/** Condomínio da página: o do vínculo ativo; superadmin, o que está em foco no menu (null = escolher). */
export async function supplierCondo(user: CurrentUser) {
  if (user.role === "superadmin") return (await adminScope(user))?.id ?? null;
  return user.condominiumId ?? null;
}

/** O fornecedor só é visto por quem é do condomínio dele (superadmin: qualquer um). */
export async function loadSupplierFor(user: CurrentUser, id: string) {
  const s = await db.supplier.findUnique({ where: { id } });
  if (!s || (user.role !== "superadmin" && s.condominiumId !== user.condominiumId)) return null;
  return s;
}

export async function loadQuoteFor(user: CurrentUser, id: string) {
  const q = await db.supplierQuote.findUnique({ where: { id }, include: { supplier: true, files: { orderBy: { createdAt: "asc" } } } });
  if (!q || (user.role !== "superadmin" && q.condominiumId !== user.condominiumId)) return null;
  return q;
}
