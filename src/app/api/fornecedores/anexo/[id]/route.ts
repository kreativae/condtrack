import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { readStored } from "@/lib/storage";
import { SUPPLIER_ROLES } from "@/lib/suppliers";
import { loadQuoteFor } from "@/lib/suppliers-server";

// Abre um arquivo de orçamento: só zelador, síndico e superadmin do condomínio do orçamento.
export async function GET(req: Request, ctx: RouteContext<"/api/fornecedores/anexo/[id]">) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  if (!(SUPPLIER_ROLES as readonly string[]).includes(user.role)) return new NextResponse("Not found", { status: 404 });
  const { id } = await ctx.params;
  const f = await db.supplierQuoteFile.findUnique({ where: { id } });
  if (!f || !(await loadQuoteFor(user, f.quoteId))) return new NextResponse("Not found", { status: 404 });

  const file = await readStored(f.url.replace(/^\/api\/media\//, "").split("/"));
  if (!file) return new NextResponse("Not found", { status: 404 });
  const download = new URL(req.url).searchParams.get("baixar") === "1";
  return new NextResponse(file.body as BodyInit, {
    headers: {
      "Content-Type": file.mime,
      ...(file.size ? { "Content-Length": String(file.size) } : {}),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(f.fileName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      // O leitor de PDF do Chrome não abre com "sandbox"; imagens ficam isoladas
      ...(f.mimeType === "application/pdf" ? {} : { "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox" }),
    },
  });
}
