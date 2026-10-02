import "server-only";
import { createHash } from "node:crypto";
import { db } from "./db";

export const hashResetToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Pedido válido (existe, não usado, não vencido, conta ativa) a partir do token do link. */
export async function findValidReset(token: string) {
  if (!token || token.length > 200) return null;
  const r = await db.passwordReset.findUnique({
    where: { tokenHash: hashResetToken(token) },
    include: { user: { select: { id: true, name: true, status: true, condominiumId: true } } },
  });
  if (!r || r.usedAt || r.expiresAt < new Date() || r.user.status !== "active") return null;
  return r;
}
