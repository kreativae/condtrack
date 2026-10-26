import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { maybeAlertLate } from "@/lib/checklist-server";
import { runMaintenance } from "@/lib/maintenance-server";
import { closeExpiredAssemblies } from "@/lib/assembly-server";
import { notifyExpiredDemos } from "@/lib/demo-trial-server";

// Verificação periódica (a cada 15 min): checklist atrasado, manutenção preventiva, fim das votações e fim do teste das demonstrações.
// Protegida por CRON_SECRET: Authorization: Bearer <CRON_SECRET>.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const condos = await db.condominium.findMany({ where: { active: true, checklistDeadline: { not: null } }, select: { id: true } });
  const now = Date.now();
  for (const c of condos) await maybeAlertLate(c.id, now);
  const maintenance = await runMaintenance(now);
  const assembliesClosed = await closeExpiredAssemblies(now);
  const demosExpired = await notifyExpiredDemos(now);
  return NextResponse.json({ checked: condos.length, maintenance, assembliesClosed, demosExpired });
}
