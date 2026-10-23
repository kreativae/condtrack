import "server-only";
import { db } from "@/lib/db";

/** Ramos já usados no condomínio (sugestões do cadastro) */
export async function usedCategories(condoId: string) {
  const rows = await db.supplier.findMany({ where: { condominiumId: condoId, category: { not: null } }, select: { category: true }, distinct: ["category"] });
  return rows.map((r) => r.category!).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/** Serviços já orçados (os mais recentes primeiro): escrever igual junta os orçamentos para comparar */
export async function usedQuoteTitles(condoId: string) {
  const rows = await db.supplierQuote.findMany({ where: { condominiumId: condoId }, select: { title: true }, orderBy: { createdAt: "desc" }, take: 200 });
  return [...new Set(rows.map((r) => r.title))].slice(0, 60);
}
