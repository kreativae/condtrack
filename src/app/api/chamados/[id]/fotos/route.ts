import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { saveFile, MAX_IMAGE_BYTES } from "@/lib/storage";
import { MAX_TICKET_PHOTOS, canTicket } from "@/lib/tickets";
import { loadTicketFor } from "@/lib/tickets-server";

const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

// Foto do chamado: uma por requisição (fora do limite de tamanho das server actions). Só quem abriu, até encerrar.
export async function POST(req: Request, ctx: RouteContext<"/api/chamados/[id]/fotos">) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (user.impersonator) return NextResponse.json({ error: "Indisponível em modo de visualização." }, { status: 403 });
  const { id } = await ctx.params;
  const t = await loadTicketFor(user, id);
  if (!t || t.createdById !== user.id || !canTicket("reply", t, user)) return NextResponse.json({ error: "Este chamado não aceita fotos." }, { status: 403 });
  if (t.photos.length >= MAX_TICKET_PHOTOS) return NextResponse.json({ error: `No máximo ${MAX_TICKET_PHOTOS} fotos por chamado.` }, { status: 400 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return NextResponse.json({ error: "Arquivo ausente." }, { status: 400 });
  if (!PHOTO_TYPES.includes(file.type)) return NextResponse.json({ error: "Use fotos JPG, PNG ou WEBP." }, { status: 400 });
  if (file.size > MAX_IMAGE_BYTES) return NextResponse.json({ error: "Foto muito grande (máx. 8 MB)." }, { status: 413 });

  const url = await saveFile(file, `ticket-${t.condominiumId}`);
  await db.ticket.update({ where: { id }, data: { photos: { push: url } } });
  revalidatePath(`/chamados/${id}`);
  return NextResponse.json({ url });
}
