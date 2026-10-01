import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { readStored } from "@/lib/storage";
import { loadEntryFor, logView } from "@/lib/finance-server";

// Abre um anexo do Financeiro: confere o acesso e registra quem abriu.
export async function GET(req: Request, ctx: RouteContext<"/api/financeiro/anexo/[id]">) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const att = await db.financeAttachment.findUnique({ where: { id } });
  if (!att) return new NextResponse("Not found", { status: 404 });
  const r = await loadEntryFor(user, att.entryId);
  // Anexo removido continua acessível a quem edita (consulta do histórico)
  if (!r || (att.deletedAt && !r.access.edit)) return new NextResponse("Not found", { status: 404 });

  const file = await readStored(att.url.replace(/^\/api\/media\//, "").split("/"));
  if (!file) return new NextResponse("Not found", { status: 404 });
  await logView(user, { condominiumId: r.entry.condominiumId, entryId: r.entry.id, attachmentId: att.id, action: "attachment_viewed", changes: { arquivo: att.fileName } });

  const download = new URL(req.url).searchParams.get("baixar") === "1";
  const name = encodeURIComponent(att.fileName);
  return new NextResponse(file.body as BodyInit, {
    headers: {
      // XML é entregue como texto puro para não ser interpretado pelo navegador
      "Content-Type": att.mimeType.includes("xml") ? "text/plain; charset=utf-8" : file.mime,
      "Content-Length": String(file.size),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${name}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      // O leitor de PDF do Chrome não abre com "sandbox"; imagens e XML ficam isolados
      ...(att.mimeType === "application/pdf" ? {} : { "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox" }),
    },
  });
}
