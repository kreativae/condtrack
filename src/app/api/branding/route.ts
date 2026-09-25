import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { MAX_IMAGE_BYTES, saveFile } from "@/lib/storage";

const TYPES = ["image/jpeg", "image/png", "image/webp"];

// Upload das imagens da página de login (logo, fundo, antes/depois). Só superadmin.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (user?.role !== "superadmin") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  const file = (await req.formData()).get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Arquivo ausente" }, { status: 400 });
  if (!TYPES.includes(file.type)) return NextResponse.json({ error: "Use JPG, PNG ou WEBP." }, { status: 400 });
  if (file.size > MAX_IMAGE_BYTES) return NextResponse.json({ error: `Imagem muito grande (máx. ${MAX_IMAGE_BYTES / 1024 / 1024}MB).` }, { status: 413 });
  const stored = await saveFile(file, "branding");
  return NextResponse.json({ url: stored.replace("/api/media/branding/", "/api/branding/") });
}
