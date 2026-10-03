import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// Contagem de notificações não lidas (o sino do topo consulta a cada 30 s com o app aberto).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const unread = user.role === "resident" ? 0 : await db.notification.count({ where: { userId: user.id, read: false } });
  return NextResponse.json({ unread }, { headers: { "Cache-Control": "no-store" } });
}
