import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { saveDocument } from "@/lib/storage";
import { financeLog, loadEntryFor } from "@/lib/finance-server";
import { ATTACHMENT_KINDS, ATTACHMENT_TYPES, MAX_ATTACHMENT_BYTES } from "@/lib/finance";

// Anexo de um lançamento (nota fiscal, boleto, comprovante): um arquivo por requisição.
export async function POST(req: Request, ctx: RouteContext<"/api/financeiro/[id]/anexos">) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const { id } = await ctx.params;
  const r = await loadEntryFor(user, id);
  if (!r || !r.access.edit) return NextResponse.json({ error: "Sem permissão para anexar neste lançamento." }, { status: 403 });
  if (r.entry.deletedAt) return NextResponse.json({ error: "Restaure o lançamento antes de anexar." }, { status: 400 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Arquivo ausente" }, { status: 400 });
  // Alguns navegadores mandam XML sem tipo: confia na extensão só para .xml
  const type = file.type || (file.name.toLowerCase().endsWith(".xml") ? "application/xml" : "");
  const ext = ATTACHMENT_TYPES[type];
  if (!ext) return NextResponse.json({ error: "Formato não suportado. Use PDF, JPG, PNG, WEBP ou o XML da nota." }, { status: 400 });
  if (file.size > MAX_ATTACHMENT_BYTES) return NextResponse.json({ error: "Arquivo muito grande (máx. 4 MB)." }, { status: 413 });
  const kindParam = String(form.get("kind") ?? "invoice");
  const kind = kindParam in ATTACHMENT_KINDS ? kindParam : "other";

  const url = await saveDocument(file, `fin-${r.entry.condominiumId}`, ext);
  const fileName = file.name.slice(0, 180) || `anexo.${ext}`;
  const att = await db.financeAttachment.create({
    data: { entryId: id, kind, url, fileName, mimeType: type, sizeBytes: file.size, uploadedById: user.id },
  });
  await financeLog(user, { condominiumId: r.entry.condominiumId, entryId: id, attachmentId: att.id, action: "attachment_added", changes: { arquivo: fileName, tipo: ATTACHMENT_KINDS[kind as keyof typeof ATTACHMENT_KINDS] } });
  revalidatePath(`/financeiro/${id}`);
  revalidatePath("/financeiro");
  return NextResponse.json({ id: att.id });
}
