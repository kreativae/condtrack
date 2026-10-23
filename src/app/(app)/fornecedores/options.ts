import "server-only";
import { db } from "@/lib/db";

/** Ramos já usados no condomínio (sugestões do cadastro) */
export async function usedCategories(condoId: string) {
  const rows = await db.supplier.findMany({ where: { condominiumId: condoId, category: { not: null } }, select: { category: true }, distinct: ["category"] });
  return rows.map((r) => r.category!).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/** Cotações abertas (as mais recentes primeiro): escrever o mesmo nome põe o orçamento nela */
export async function usedQuoteTitles(condoId: string) {
  const rows = await db.quoteGroup.findMany({ where: { condominiumId: condoId, status: "open", archivedAt: null }, select: { title: true }, orderBy: { createdAt: "desc" }, take: 80 });
  return [...new Set(rows.map((r) => r.title))];
}
