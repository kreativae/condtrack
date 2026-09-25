import { NextResponse } from "next/server";
import { readStored } from "@/lib/storage";

// Imagens da página de login: públicas (quem ainda não entrou precisa vê-las).
// Nomes são UUIDs, então o cache pode ser longo.
export async function GET(_: Request, ctx: RouteContext<"/api/branding/[name]">) {
  const { name } = await ctx.params;
  const file = await readStored(["branding", name]);
  if (!file) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(file.body as BodyInit, {
    headers: {
      "Content-Type": file.mime,
      "Content-Length": String(file.size),
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
