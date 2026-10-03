"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { condoSyndics } from "@/lib/memberships";

// Exclusão de comunicado: o superadmin pede, o síndico aprova (como nas assembleias publicadas).

export type AnnouncementChangeState = { error?: string; ok?: boolean; message?: string } | undefined;

/** Superadmin pede para excluir um comunicado, com o motivo. Nada some até o síndico aprovar. */
export async function requestAnnouncementDelete(id: string, _: AnnouncementChangeState, form: FormData): Promise<AnnouncementChangeState> {
  const user = await requireUser("superadmin");
  const a = await db.announcement.findUnique({ where: { id } });
  if (!a) return { error: "Comunicado não encontrado." };
  const reason = String(form.get("reason") ?? "").trim().slice(0, 500);
  if (reason.length < 5) return { error: "Explique o motivo da exclusão para o síndico." };
  if (await db.announcementChange.findFirst({ where: { announcementId: id, status: "pending" } })) return { error: "Já há um pedido aguardando o síndico." };
  const syndics = await condoSyndics(a.condominiumId);
  if (!syndics.length) return { error: "Este condomínio não tem síndico para aprovar o pedido." };

  const c = await db.announcementChange.create({ data: { announcementId: id, reason, requestedById: user.id, requestedBy: user.name } });
  await audit(user, "announcement_delete_request", "announcement", id, { new: { pedido: c.id, titulo: a.title, motivo: reason }, condominiumId: a.condominiumId });
  await notify(
    { condominiumId: a.condominiumId, userIds: syndics.map((s) => s.id) },
    { type: "announcement_delete_request", vars: { titulo: a.title, autor: user.name, comentario: reason }, referenceType: "announcement", referenceId: id },
  );
  revalidatePath("/comunicados");
  return { ok: true, message: "Pedido enviado ao síndico." };
}

/** Superadmin desiste do pedido. */
export async function cancelAnnouncementDelete(changeId: string) {
  const user = await requireUser("superadmin");
  const c = await db.announcementChange.findUnique({ where: { id: changeId }, include: { announcement: { select: { condominiumId: true } } } });
  if (!c || c.status !== "pending") return;
  await db.announcementChange.update({ where: { id: changeId }, data: { status: "cancelled", decidedById: user.id, decidedBy: user.name, decidedAt: new Date() } });
  await audit(user, "announcement_delete_cancel", "announcement", c.announcementId, { new: { pedido: c.id }, condominiumId: c.announcement.condominiumId });
  revalidatePath("/comunicados");
}

/** Síndico aprova (o comunicado é apagado) ou recusa o pedido. O botão clicado diz a decisão. */
export async function decideAnnouncementDelete(changeId: string, _: AnnouncementChangeState, form: FormData): Promise<AnnouncementChangeState> {
  const user = await requireUser("syndic");
  if (user.impersonator) return { error: "Em modo de visualização não é possível decidir o pedido." };
  const c = await db.announcementChange.findUnique({ where: { id: changeId }, include: { announcement: true } });
  if (!c || c.announcement.condominiumId !== user.condominiumId) return { error: "Pedido não encontrado." };
  const approve = form.get("decision") === "approve";
  const note = String(form.get("note") ?? "").trim().slice(0, 500) || null;
  // Reserva a decisão: só uma pessoa decide, uma vez
  const claim = await db.announcementChange.updateMany({
    where: { id: changeId, status: "pending" },
    data: { status: approve ? "approved" : "rejected", decidedById: user.id, decidedBy: user.name, decisionNote: note, decidedAt: new Date() },
  });
  if (!claim.count) return { error: "Este pedido já foi decidido." };
  const a = c.announcement;

  if (approve) {
    await audit(user, "delete", "announcement", a.id, {
      old: { titulo: a.title, conteudo: a.content, publicadoEm: a.publishedAt, pedidoDe: c.requestedBy, motivo: c.reason },
      condominiumId: a.condominiumId,
    });
    await db.announcement.delete({ where: { id: a.id } });
  } else {
    await audit(user, "announcement_delete_reject", "announcement", a.id, { new: { pedido: c.id, motivo: note }, condominiumId: a.condominiumId });
  }
  await notify(
    { condominiumId: a.condominiumId, userIds: [c.requestedById] },
    { type: "announcement_delete_decided", vars: { titulo: a.title, decisao: approve ? "aprovado" : "recusado", autor: user.name, comentario: note }, referenceType: "announcement" },
  );
  revalidatePath("/comunicados");
  return { ok: true, message: approve ? "Comunicado excluído." : "Pedido recusado. O comunicado continua publicado." };
}

/** Síndico apaga direto um comunicado que ele mesmo publicou (o conteúdo fica na auditoria). */
export async function deleteOwnAnnouncement(id: string) {
  const user = await requireUser("syndic");
  const a = await db.announcement.findUnique({ where: { id } });
  if (!a || a.condominiumId !== user.condominiumId || a.authorId !== user.id) return;
  await audit(user, "delete", "announcement", a.id, { old: { titulo: a.title, conteudo: a.content, publicadoEm: a.publishedAt }, condominiumId: a.condominiumId });
  await db.announcement.delete({ where: { id } });
  revalidatePath("/comunicados");
}
