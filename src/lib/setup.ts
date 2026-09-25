import "server-only";
import { db } from "./db";

/** Primeiro acesso disponível: ainda não existe nenhum superadmin. */
export async function setupAvailable() {
  return (await db.user.count({ where: { role: "superadmin" } })) === 0;
}

export function setupTokenConfigured() {
  return !!process.env.SETUP_TOKEN && process.env.SETUP_TOKEN.length >= 12;
}
