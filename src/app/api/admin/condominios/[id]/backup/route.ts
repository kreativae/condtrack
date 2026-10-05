import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { condoBackupZip } from "@/lib/condo-purge";

export const maxDuration = 60;

// Backup completo de um condomínio arquivado (.zip), exigido antes da exclusão definitiva.
export async function GET(_req: Request, ctx: RouteContext<"/api/admin/condominios/[id]/backup">) {
  const user = await getCurrentUser();
  if (!user || user.role !== "superadmin" || user.impersonator) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  const { id } = await ctx.params;
  const c = await db.condominium.findUnique({ where: { id }, select: { deletedAt: true } });
  if (!c?.deletedAt) return NextResponse.json({ error: "Só condomínios excluídos (arquivados) têm backup para exclusão definitiva." }, { status: 400 });
  const b = await condoBackupZip(id);
  if (!b) return NextResponse.json({ error: "Condomínio não encontrado." }, { status: 404 });
  await audit(user, "backup", "condominium", id, { new: { condominio: b.name, anexos: b.files, bytes: b.bytes.length }, condominiumId: id });
  const file = `backup-${b.name.normalize("NFD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "condominio"}-${new Date().toISOString().slice(0, 10)}.zip`;
  return new NextResponse(b.bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${file}"`,
      "Content-Length": String(b.bytes.length),
      "Cache-Control": "no-store",
    },
  });
}
