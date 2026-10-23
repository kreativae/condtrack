import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { saveDocument } from "@/lib/storage";
import { MAX_QUOTE_FILES, MAX_QUOTE_FILE_BYTES, QUOTE_FILE_TYPES, SUPPLIER_ROLES, canChangeQuote } from "@/lib/suppliers";
import { loadQuoteFor } from "@/lib/suppliers-server";

// Arquivo do orçamento (PDF ou foto): um por requisição, fora do limite de tamanho das server actions.
export async function POST(req: Request, ctx: RouteContext<"/api/fornecedores/orcamento/[id]/anexos">) {
  const user = await getCurrentUser();
  if (!user || !(SUPPLIER_ROLES as readonly string[]).includes(user.role)) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  if (user.impersonator) return NextResponse.json({ error: "Indisponível em modo de visualização." }, { status: 403 });
  const { id } = await ctx.params;
  const q = await loadQuoteFor(user, id);
  if (!q) return NextResponse.json({ error: "Orçamento não encontrado." }, { status: 404 });
  if (!canChangeQuote(q, user)) return NextResponse.json({ error: "Este orçamento não aceita mais arquivos." }, { status: 403 });
  if (q.files.length >= MAX_QUOTE_FILES) return NextResponse.json({ error: `No máximo ${MAX_QUOTE_FILES} arquivos por orçamento.` }, { status: 400 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return NextResponse.json({ error: "Arquivo ausente." }, { status: 400 });
  const ext = QUOTE_FILE_TYPES[file.type];
  if (!ext) return NextResponse.json({ error: "Use PDF, JPG, PNG ou WEBP." }, { status: 400 });
  if (file.size > MAX_QUOTE_FILE_BYTES) return NextResponse.json({ error: "Arquivo muito grande (máx. 8 MB)." }, { status: 413 });

  const url = await saveDocument(file, `quote-${q.condominiumId}`, ext);
  const fileName = file.name.slice(0, 180) || `orcamento.${ext}`;
  const f = await db.supplierQuoteFile.create({ data: { quoteId: id, url, fileName, mimeType: file.type, sizeBytes: file.size, uploadedById: user.id } });
  await audit(user, "add_file", "supplier_quote", id, { new: { arquivo: fileName }, condominiumId: q.condominiumId });
  revalidatePath(`/fornecedores/orcamento/${id}`);
  revalidatePath("/fornecedores");
  return NextResponse.json({ id: f.id });
}
