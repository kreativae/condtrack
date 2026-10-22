import "server-only";
import { db } from "./db";
import { parcelCarriers, parcelLocations } from "./parcels";

/** Sugestões do recebimento de encomendas: listas da Estrutura ou, sem elas, padrão e locais já usados. */
export async function parcelOptions(condominiumId: string) {
  const [condo, used] = await Promise.all([
    db.condominium.findUnique({ where: { id: condominiumId }, select: { parcelCarriers: true, parcelLocations: true } }),
    db.parcel.findMany({ where: { condominiumId, location: { not: null } }, select: { location: true }, orderBy: { receivedAt: "desc" }, take: 500 }),
  ]);
  return {
    carriers: parcelCarriers(condo?.parcelCarriers ?? []),
    locations: parcelLocations(condo?.parcelLocations ?? [], used.map((p) => p.location)),
  };
}
