import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { pushEnabled, savePushDevice } from "@/lib/push";

// O navegador renovou a inscrição de notificações (evento "pushsubscriptionchange" no sw.js):
// grava a nova e apaga a antiga, mantendo o nome do aparelho.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.impersonator) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!pushEnabled()) return NextResponse.json({ error: "push desativado" }, { status: 400 });
  const body = (await req.json().catch(() => null)) as { subscription?: unknown; oldEndpoint?: string | null } | null;
  if (!body?.subscription) return NextResponse.json({ error: "inscrição ausente" }, { status: 400 });
  const old = body.oldEndpoint ? await db.pushDevice.findFirst({ where: { endpoint: body.oldEndpoint, userId: user.id } }) : null;
  const r = await savePushDevice(user.id, body.subscription, old?.name || "Navegador");
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  if (old && old.endpoint !== r.endpoint) await db.pushDevice.delete({ where: { id: old.id } });
  return NextResponse.json({ ok: true });
}
