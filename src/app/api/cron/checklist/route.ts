import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { maybeAlertLate } from "@/lib/checklist-server";

// Verificação periódica do checklist atrasado (ex.: Vercel Cron ou agendador externo).
// Protegida por CRON_SECRET: Authorization: Bearer <CRON_SECRET>.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const condos = await db.condominium.findMany({ where: { active: true, checklistDeadline: { not: null } }, select: { id: true } });
  const now = Date.now();
  for (const c of condos) await maybeAlertLate(c.id, now);
  return NextResponse.json({ checked: condos.length });
}
