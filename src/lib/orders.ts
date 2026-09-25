import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import type { CurrentUser } from "./auth";
import { unitLabel } from "@/lib/units";

/** Filtro base de OS visíveis na listagem de cada papel. */
export function orderScope(user: CurrentUser): Prisma.ServiceOrderWhereInput {
  switch (user.role) {
    case "superadmin":
      return {};
    case "syndic":
    case "caretaker":
      return { condominiumId: user.condominiumId ?? "__none__" };
    case "provider":
      return { assignedToId: user.id };
    case "council":
      return { condominiumId: user.condominiumId ?? "__none__", requestedById: user.id };
    case "resident":
      return { condominiumId: user.condominiumId ?? "__none__", status: "approved" };
  }
}

export const orderListInclude = {
  category: true,
  commonArea: true,
  unit: { include: { building: true } },
  assignedTo: { select: { id: true, name: true, company: true } },
  condominium: { select: { id: true, name: true } },
  _count: { select: { media: true } },
} satisfies Prisma.ServiceOrderInclude;

export type OrderListItem = Prisma.ServiceOrderGetPayload<{ include: typeof orderListInclude }>;

export function locationLabel(o: { locationType: string; commonArea?: { name: string } | null; unit?: { number: string; type?: string | null; building: { name: string; kind?: string | null; implicit?: boolean | null } } | null; locationNote?: string | null }) {
  const base = o.locationType === "unit" && o.unit ? unitLabel(o.unit) : o.commonArea?.name ?? "Área comum";
  return o.locationNote ? `${base} — ${o.locationNote}` : base;
}

export async function nextProtocol(condominiumId: string, tx: Prisma.TransactionClient = db) {
  const c = await tx.condominium.update({ where: { id: condominiumId }, data: { osCounter: { increment: 1 } } });
  return `OS-${new Date().getFullYear()}-${String(c.osCounter).padStart(5, "0")}`;
}
