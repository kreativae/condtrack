import "server-only";
import { revalidatePath } from "next/cache";
import { db } from "./db";
import type { CurrentUser } from "./auth";
import { adminScope } from "./admin-scope-server";
import { audit } from "./audit";
import { notify } from "./notify";
import { readStored, saveGenerated } from "./storage";
import { unitLabel } from "./units";
import { ACTIVE_STATUSES, canTicket, canViewTicket, ticketKind } from "./tickets";

/** Condomínio da página: o do vínculo ativo; superadmin, o que está em foco no menu (null = escolher). */
export async function ticketCondo(user: CurrentUser) {
  if (user.role === "superadmin") return (await adminScope(user))?.id ?? null;
  return user.condominiumId ?? null;
}

export const ticketInclude = {
  unit: { include: { building: true } },
  commonArea: { select: { name: true } },
  serviceOrder: { select: { id: true, protocol: true, status: true, approvedAt: true, condominiumId: true, requestedById: true, assignedToId: true, rating: true } },
} as const;

/** O chamado, se a pessoa pode vê-lo (quem abriu, ou quem atende no condomínio). */
export async function loadTicketFor(user: CurrentUser, id: string) {
  const t = await db.ticket.findUnique({ where: { id }, include: ticketInclude });
  if (!t) return null;
  return canViewTicket(t, user) ? t : null;
}

/** "Área comum: Garagem · perto do portão" / "Torre A · 101" / null */
export function ticketPlace(t: { locationType: string | null; locationNote: string | null; commonArea: { name: string } | null; unit: Parameters<typeof unitLabel>[0] | null }) {
  const base = t.locationType === "common_area" && t.commonArea ? t.commonArea.name : t.locationType === "unit" && t.unit ? unitLabel(t.unit) : null;
  return [base, t.locationNote].filter(Boolean).join(" · ") || null;
}

/** Copia as fotos do chamado para a pasta da OS (a OS tem as próprias permissões de acesso). */
export async function copyTicketPhotos(photos: string[], orderId: string) {
  const out: { url: string; mime: string; size: number }[] = [];
  for (const url of photos) {
    const parts = url.replace(/^\/api\/media\//, "").split("/");
    const f = await readStored(parts).catch(() => null);
    if (!f) continue;
    const bytes = f.body instanceof Uint8Array ? f.body : new Uint8Array(await new Response(f.body).arrayBuffer());
    const copy = await saveGenerated(orderId, `chamado-${parts[1]}`, Buffer.from(bytes), f.mime);
    out.push({ url: copy, mime: f.mime, size: bytes.length });
  }
  return out;
}

function refresh(id: string) {
  revalidatePath("/chamados");
  revalidatePath(`/chamados/${id}`);
  revalidatePath("/dashboard");
}

type TicketLike = { number: number; title: string; kind: string; unit: Parameters<typeof unitLabel>[0] | null };
/** Variáveis dos modelos de aviso (Configurações → Mensagens) */
export function ticketVars(t: TicketLike, user: { name: string }) {
  return { numero: `#${t.number}`, titulo: t.title, tipo: ticketKind(t.kind).label, unidade: t.unit ? unitLabel(t.unit) : "", autor: user.name };
}

/** Registro automático na conversa ("mudou a situação", "virou OS") */
export async function ticketSystemNote(ticketId: string, user: Pick<CurrentUser, "id" | "name" | "role">, body: string) {
  await db.ticketMessage.create({ data: { ticketId, authorId: user.id, authorName: user.name, authorRole: user.role, body, system: true } });
}

// ───────────────────────────── OS ─────────────────────────────

/**
 * Liga o chamado à OS recém-criada (chamado por createOrder quando a OS vem de um chamado).
 * Devolve false se o chamado não pode mais virar OS (outra pessoa converteu ou encerrou antes).
 */
export async function linkTicketToOrder(user: CurrentUser, ticketId: string, order: { id: string; protocol: string; condominiumId: string }) {
  const t = await loadTicketFor(user, ticketId);
  if (!t || t.condominiumId !== order.condominiumId || !canTicket("convert", t, user)) return false;
  const res = await db.ticket.updateMany({
    where: { id: ticketId, status: { in: ACTIVE_STATUSES }, serviceOrderId: null },
    data: { status: "converted", serviceOrderId: order.id, convertedAt: new Date(), ...(!t.answeredAt && { answeredAt: new Date() }) },
  });
  if (!res.count) return false;
  await ticketSystemNote(ticketId, user, `Virou a ordem de serviço ${order.protocol}.`);
  await audit(user, "convert", "ticket", ticketId, { new: { serviceOrderId: order.id, protocol: order.protocol }, condominiumId: t.condominiumId });
  await notify(
    { condominiumId: t.condominiumId, userIds: [t.createdById], exclude: user.id },
    { type: "ticket_converted", vars: { ...ticketVars(t, user), protocolo: order.protocol }, referenceType: "ticket", referenceId: ticketId },
  );
  refresh(ticketId);
  return true;
}

/**
 * A OS de um chamado mudou: aprovada → chamado resolvido (avisa quem abriu); cancelada ou excluída →
 * o chamado volta para análise, para o síndico decidir o que fazer.
 */
export async function syncTicketsWithOrder(user: CurrentUser, order: { id: string; protocol: string }, event: "approved" | "cancelled" | "deleted", comment = "") {
  const tickets = await db.ticket.findMany({ where: { serviceOrderId: order.id, status: "converted" }, include: ticketInclude });
  for (const t of tickets) {
    if (event === "approved") {
      await db.ticket.update({ where: { id: t.id }, data: { status: "resolved", closedAt: new Date(), closedByName: user.name, closeNote: `Serviço concluído pela OS ${order.protocol}.` } });
      await ticketSystemNote(t.id, user, `A OS ${order.protocol} foi concluída e aprovada. Chamado resolvido.`);
      await notify(
        { condominiumId: t.condominiumId, userIds: [t.createdById] },
        { type: "ticket_resolved", vars: { ...ticketVars(t, user), comentario: `Serviço concluído pela OS ${order.protocol}.` }, referenceType: "ticket", referenceId: t.id },
      );
    } else {
      await db.ticket.update({ where: { id: t.id }, data: { status: "in_review", ...(event === "deleted" && { serviceOrderId: null }) } });
      await ticketSystemNote(t.id, user, event === "cancelled" ? `A OS ${order.protocol} foi cancelada${comment ? `: ${comment}` : ""}. O chamado voltou para análise.` : `A OS ${order.protocol} foi excluída. O chamado voltou para análise.`);
    }
    refresh(t.id);
  }
}
