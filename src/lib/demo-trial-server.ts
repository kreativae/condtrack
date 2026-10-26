import "server-only";
import { db } from "./db";
import { notify } from "./notify";

/**
 * Avisa os superadmins das demonstrações externas cujo prazo acabou (uma vez por prazo: prorrogar zera o aviso).
 * Chamado pelo cron a cada 15 min e ao abrir a lista de condomínios. O `updateMany` condicional garante um aviso só,
 * mesmo com duas chamadas ao mesmo tempo.
 */
export async function notifyExpiredDemos(nowMs: number) {
  const now = new Date(nowMs);
  const due = await db.condominium.findMany({
    where: { demo: true, deletedAt: null, demoExpiresAt: { lte: now }, demoExpiredNotifiedAt: null },
    select: { id: true, name: true, demoExpiresAt: true, demoContactName: true, demoContactEmail: true, demoContactPhone: true },
  });
  if (!due.length) return 0;
  const admins = await db.user.findMany({ where: { role: "superadmin", status: "active" }, select: { id: true } });
  let sent = 0;
  for (const c of due) {
    const claimed = await db.condominium.updateMany({ where: { id: c.id, demoExpiredNotifiedAt: null }, data: { demoExpiredNotifiedAt: now } });
    if (!claimed.count) continue;
    const contato = [c.demoContactName, c.demoContactEmail, c.demoContactPhone].filter(Boolean).join(" · ");
    await notify(
      { condominiumId: c.id, userIds: admins.map((a) => a.id) },
      { type: "demo_expired", vars: { contato, fim: new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(c.demoExpiresAt!) }, referenceType: "condominium", referenceId: c.id },
    );
    sent++;
  }
  return sent;
}
