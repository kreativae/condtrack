import "server-only";
import { db } from "@/lib/db";
import { inCondo } from "@/lib/memberships";

/** Categorias, áreas e prestadores do condomínio (para o formulário do plano). */
export async function planOptions(condominiumId: string) {
  const [categories, areas, providers] = await Promise.all([
    db.serviceCategory.findMany({ where: { condominiumId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.commonArea.findMany({ where: { condominiumId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.user.findMany({ where: { status: "active", ...inCondo(condominiumId, ["provider"]) }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return { categories, areas, providers };
}
