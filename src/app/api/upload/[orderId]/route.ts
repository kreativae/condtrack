import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { saveFile, ALLOWED_MIME, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES } from "@/lib/storage";
import { can, MAX_MEDIA_PER_PHASE, MAX_VIDEO_SECONDS, PHASE_LABEL, type Phase } from "@/lib/workflow";

// Upload de uma mídia por requisição (fotos já chegam comprimidas e com marca
// d'água aplicada no cliente — ver components/media-uploader.tsx).
export async function POST(req: Request, ctx: RouteContext<"/api/upload/[orderId]">) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { orderId } = await ctx.params;
  const phase = new URL(req.url).searchParams.get("phase") as Phase | null;
  if (!phase || !(phase in PHASE_LABEL)) return NextResponse.json({ error: "Etapa inválida" }, { status: 400 });

  const order = await db.serviceOrder.findUnique({ where: { id: orderId } });
  if (!order) return NextResponse.json({ error: "OS não encontrada" }, { status: 404 });

  const allowed =
    phase === "opening"
      ? order.status === "open" && (order.requestedById === user.id || ["syndic", "superadmin", "caretaker"].includes(user.role)) && (user.role === "superadmin" || user.condominiumId === order.condominiumId)
      : phase === "after"
        ? can("upload_after", order, user)
        : phase === "before"
          ? can("upload_before", order, user)
          : can("upload_after", order, user) || can("upload_before", order, user);
  if (!allowed) return NextResponse.json({ error: "Você não pode anexar mídias nesta etapa." }, { status: 403 });

  const count = await db.serviceMedia.count({ where: { serviceOrderId: orderId, phase } });
  if (count >= MAX_MEDIA_PER_PHASE) return NextResponse.json({ error: `Limite de ${MAX_MEDIA_PER_PHASE} arquivos por etapa atingido.` }, { status: 400 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Arquivo ausente" }, { status: 400 });
  if (!ALLOWED_MIME.includes(file.type)) return NextResponse.json({ error: "Formato não suportado. Use JPG, PNG, WEBP, MP4, WEBM ou MOV." }, { status: 400 });

  const isVideo = file.type.startsWith("video/");
  if (file.size > (isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES)) {
    return NextResponse.json({ error: `Arquivo muito grande (máx. ${(isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES) / 1024 / 1024}MB).` }, { status: 413 });
  }
  let meta: Record<string, unknown> = {};
  try {
    meta = JSON.parse(String(form.get("meta") ?? "{}"));
  } catch {}
  if (isVideo && Number(meta.duration) > MAX_VIDEO_SECONDS + 1) {
    return NextResponse.json({ error: "Vídeos devem ter no máximo 2 minutos." }, { status: 400 });
  }

  const url = await saveFile(file, orderId);
  const media = await db.serviceMedia.create({
    data: {
      serviceOrderId: orderId,
      type: isVideo ? "video" : "photo",
      phase,
      url,
      mimeType: file.type,
      sizeBytes: file.size,
      metadata: JSON.stringify({ ...meta, originalName: file.name, receivedAt: new Date().toISOString() }),
      uploadedById: user.id,
    },
  });
  await db.serviceEvent.create({
    data: { serviceOrderId: orderId, userId: user.id, type: "media", comment: `${isVideo ? "Vídeo" : "Foto"} anexada — ${PHASE_LABEL[phase]}.` },
  });
  await audit(user, "upload_media", "service_media", media.id, { new: { phase, url }, condominiumId: order.condominiumId });
  if (phase === "before" && count === 0) {
    await notify(
      { condominiumId: order.condominiumId, roles: ["syndic", "caretaker"], exclude: user.id },
      { type: "os_before_media", vars: { protocolo: order.protocol, titulo: order.title, autor: user.name }, referenceType: "service_order", referenceId: orderId },
    );
  }
  revalidatePath(`/os/${orderId}`);
  if (order.status === "approved") revalidatePath("/feed");
  return NextResponse.json({ id: media.id, url });
}
