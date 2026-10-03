import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "./db";

// Vínculos usuário ↔ condomínio. User.condominiumId/role/permissions = vínculo ATIVO;
// para "quem é deste condomínio" use sempre os vínculos (pega quem está ativo em outro prédio).

/** Filtro de usuários com vínculo no condomínio (opcionalmente só alguns perfis). */
export function inCondo(condominiumId: string, roles?: readonly string[]): Prisma.UserWhereInput {
  return { memberships: { some: { condominiumId, ...(roles?.length ? { role: { in: [...roles] } } : {}) } } };
}

/** Vínculos de um usuário, com o nome do condomínio (para o seletor do menu). */
export function userMemberships(userId: string) {
  return db.membership.findMany({
    // Condomínios arquivados não aparecem nos vínculos
    where: { userId, condominium: { deletedAt: null } },
    include: { condominium: { select: { id: true, name: true, active: true } } },
    orderBy: { condominium: { name: "asc" } },
  });
}

/** Torna ativo um vínculo do usuário: copia condomínio, perfil e permissões para a conta. */
export async function activateMembership(userId: string, condominiumId: string) {
  const m = await db.membership.findUnique({ where: { userId_condominiumId: { userId, condominiumId } } });
  if (!m) return null;
  await db.user.update({ where: { id: userId }, data: { condominiumId: m.condominiumId, role: m.role, permissions: m.permissions } });
  return m;
}

/**
 * Grava os vínculos de um usuário (lista completa) e mantém o ativo coerente:
 * se o condomínio ativo saiu da lista, o primeiro vínculo vira o ativo.
 */
export async function setMemberships(userId: string, list: { condominiumId: string; role: string; permissions: string }[], activeCondo?: string | null) {
  const unique = [...new Map(list.map((m) => [m.condominiumId, m])).values()];
  await db.$transaction([
    db.membership.deleteMany({ where: { userId, condominiumId: { notIn: unique.map((m) => m.condominiumId) } } }),
    ...unique.map((m) =>
      db.membership.upsert({
        where: { userId_condominiumId: { userId, condominiumId: m.condominiumId } },
        create: { userId, ...m },
        update: { role: m.role, permissions: m.permissions },
      }),
    ),
  ]);
  const active = unique.find((m) => m.condominiumId === activeCondo) ?? unique[0];
  if (active) await db.user.update({ where: { id: userId }, data: { condominiumId: active.condominiumId, role: active.role, permissions: active.permissions } });
}

/** Síndicos ativos com vínculo no condomínio (quem aprova os pedidos do superadmin). */
export const condoSyndics = (condominiumId: string) =>
  db.user.findMany({ where: { status: "active", ...inCondo(condominiumId, ["syndic"]) }, select: { id: true, name: true } });
