import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { MAX_IMAGE_BYTES, saveFile } from "@/lib/storage";

const TYPES = ["image/jpeg", "image/png", "image/webp"];

// Foto de um item do checklist (zelador, síndico ou superadmin do condomínio).
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || !["caretaker", "syndic", "superadmin"].includes(user.role)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  const form = await req.formData();
  const condominiumId = user.role === "superadmin" ? String(form.get("condominiumId") ?? "") : user.condominiumId;
  if (!condominiumId) return NextResponse.json({ error: "Condomínio não informado" }, { status: 400 });
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Arquivo ausente" }, { status: 400 });
  if (!TYPES.includes(file.type)) return NextResponse.json({ error: "Use JPG, PNG ou WEBP." }, { status: 400 });
  if (file.size > MAX_IMAGE_BYTES) return NextResponse.json({ error: "Imagem muito grande (máx. 8MB)." }, { status: 413 });
  return NextResponse.json({ url: await saveFile(file, `checklist-${condominiumId}`) });
}
