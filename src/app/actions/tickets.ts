"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { unitLabel } from "@/lib/units";
import { myUnits } from "@/lib/booking-server";
import { loadTicketFor, ticketSystemNote, ticketVars } from "@/lib/tickets-server";
import { ACTIVE_STATUSES, MAX_OPEN_TICKETS, TICKET_AUTHORS, TICKET_KINDS, TICKET_ROLES, canManageTickets, canTicket, statusAfterReply, ticketKind, type TicketAction } from "@/lib/tickets";

export type TicketState = { error?: string; ok?: boolean; id?: string } | undefined;
const fail = (error: string): TicketState => ({ error });

function refresh(id?: string) {
  revalidatePath("/chamados");
  if (id) revalidatePath(`/chamados/${id}`);
  revalidatePath("/dashboard");
}


// ───────────────────────────── Abrir ─────────────────────────────

const createSchema = z.object({
  kind: z.enum(Object.keys(TICKET_KINDS) as [string, ...string[]], { message: "Escolha o tipo do chamado." }),
  title: z.string().trim().min(4, "Escreva o assunto (mín. 4 caracteres).").max(120),
  description: z.string().trim().min(10, "Conte um pouco mais (mín. 10 caracteres).").max(4000),
  locationType: z.enum(["common_area", "unit", "none"]).default("none"),
  commonAreaId: z.string().optional(),
  unitId: z.string().optional(),
  locationNote: z.string().trim().max(200).optional(),
});

export async function createTicket(_: TicketState, form: FormData): Promise<TicketState> {
  const user = await requireUser(...TICKET_AUTHORS);
  const condoId = user.condominiumId;
  if (!condoId) return fail("Sua conta não está ligada a um condomínio.");
  const parsed = createSchema.safeParse(Object.fromEntries([...form.entries()].filter(([, v]) => v !== "")));
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const d = parsed.data;

  const open = await db.ticket.count({ where: { condominiumId: condoId, createdById: user.id, status: { in: ACTIVE_STATUSES } } });
  if (open >= MAX_OPEN_TICKETS) return fail(`Você já tem ${open} chamados aguardando resposta. Acompanhe-os antes de abrir outro.`);

  // Local: área comum do condomínio ou uma unidade da própria pessoa
  let commonAreaId: string | null = null;
  let unitId: string | null = null;
  if (d.locationType === "common_area") {
    if (!d.commonAreaId || !(await db.commonArea.findFirst({ where: { id: d.commonAreaId, condominiumId: condoId }, select: { id: true } }))) return fail("Escolha a área comum.");
    commonAreaId = d.commonAreaId;
  }
  const mine = myUnits(user, condoId);
  if (d.locationType === "unit") {
    if (!d.unitId || !mine.some((u) => u.id === d.unitId)) return fail("Escolha a sua unidade.");
    unitId = d.unitId;
  }

  const t = await db.$transaction(async (tx) => {
    const c = await tx.condominium.update({ where: { id: condoId }, data: { ticketCounter: { increment: 1 } }, select: { ticketCounter: true } });
    return tx.ticket.create({
      data: {
        condominiumId: condoId,
        number: c.ticketCounter,
        kind: d.kind,
        title: d.title,
        description: d.description,
        locationType: d.locationType === "none" ? null : d.locationType,
        commonAreaId,
        // Sem local na unidade, guarda a unidade de quem abriu (aparece para o síndico)
        unitId: unitId ?? mine[0]?.id ?? null,
        locationNote: d.locationNote || null,
        createdById: user.id,
        createdByName: user.name,
        createdByRole: user.role,
      },
      include: { unit: { include: { building: true } } },
    });
  });

  await audit(user, "create", "ticket", t.id, { new: { number: t.number, kind: t.kind, title: t.title }, condominiumId: condoId });
  await notify(
    { condominiumId: condoId, roles: ["syndic"], exclude: user.id },
    { type: "ticket_created", vars: { numero: `#${t.number}`, titulo: t.title, tipo: ticketKind(t.kind).label, unidade: t.unit ? unitLabel(t.unit) : "", autor: user.name }, referenceType: "ticket", referenceId: t.id },
  );
  refresh();
  return { ok: true, id: t.id };
}

// ───────────────────────────── Conversa ─────────────────────────────

export async function replyTicket(id: string, _: TicketState, form: FormData): Promise<TicketState> {
  const user = await requireUser(...TICKET_ROLES);
  const t = await loadTicketFor(user, id);
  if (!t || !canTicket("reply", t, user)) return fail("Não é possível responder este chamado.");
  const body = String(form.get("body") ?? "").trim();
  if (body.length < 2) return fail("Escreva a mensagem.");
  if (body.length > 3000) return fail("Mensagem muito longa (máx. 3.000 caracteres).");

  const manager = canManageTickets(user.role);
  const status = statusAfterReply(t.status, manager);
  await db.$transaction([
    db.ticketMessage.create({ data: { ticketId: id, authorId: user.id, authorName: user.name, authorRole: user.role, body } }),
    db.ticket.update({ where: { id }, data: { status, ...(manager && !t.answeredAt && { answeredAt: new Date() }) } }),
  ]);
  await notify(
    manager ? { condominiumId: t.condominiumId, userIds: [t.createdById], exclude: user.id } : { condominiumId: t.condominiumId, roles: ["syndic"], exclude: user.id },
    { type: "ticket_reply", vars: { ...ticketVars(t, user), mensagem: body.length > 280 ? `${body.slice(0, 277)}…` : body }, referenceType: "ticket", referenceId: id },
  );
  refresh(id);
  return { ok: true };
}

// ───────────────────────────── Situação ─────────────────────────────

const NEXT: Record<Exclude<TicketAction, "reply" | "convert">, { to: string; note: string; needsReason?: boolean }> = {
  review: { to: "in_review", note: "Chamado em análise." },
  resolve: { to: "resolved", note: "Chamado resolvido." },
  close: { to: "closed", note: "Chamado encerrado sem resolver.", needsReason: true },
  cancel: { to: "closed", note: "Chamado cancelado por quem abriu." },
  reopen: { to: "open", note: "Chamado reaberto.", needsReason: true },
};

/** Em análise, resolver, encerrar (com motivo), cancelar (quem abriu) e reabrir (quem abriu, com motivo). */
export async function setTicketStatus(id: string, action: keyof typeof NEXT, _: TicketState, form: FormData): Promise<TicketState> {
  const user = await requireUser(...TICKET_ROLES);
  const t = await loadTicketFor(user, id);
  if (!t || !canTicket(action, t, user)) return fail("Ação não permitida para a situação atual do chamado.");
  const step = NEXT[action];
  const note = String(form.get("note") ?? "").trim().slice(0, 1000);
  if (step.needsReason && note.length < 5) return fail("Escreva o motivo (mín. 5 caracteres).");

  const manager = canManageTickets(user.role);
  const done = step.to === "resolved" || step.to === "closed";
  // Reserva a mudança só se a situação ainda for a mesma (dois cliques ao mesmo tempo não duplicam)
  const res = await db.ticket.updateMany({
    where: { id, status: t.status },
    data: {
      status: step.to,
      ...(done ? { closedAt: new Date(), closedByName: user.name, closeNote: note || null } : { closedAt: null, closedByName: null, closeNote: null }),
      ...(manager && !t.answeredAt && { answeredAt: new Date() }),
    },
  });
  if (!res.count) return fail("O chamado mudou enquanto você decidia. Recarregue a página.");
  await ticketSystemNote(id, user, note ? `${step.note}\n${note}` : step.note);
  await audit(user, action, "ticket", id, { old: { status: t.status }, new: { status: step.to, note }, condominiumId: t.condominiumId });

  const vars = { ...ticketVars(t, user), comentario: note };
  if (action === "resolve") await notify({ condominiumId: t.condominiumId, userIds: [t.createdById], exclude: user.id }, { type: "ticket_resolved", vars, referenceType: "ticket", referenceId: id });
  if (action === "close") await notify({ condominiumId: t.condominiumId, userIds: [t.createdById], exclude: user.id }, { type: "ticket_closed", vars, referenceType: "ticket", referenceId: id });
  if (action === "cancel" || action === "reopen") {
    await notify({ condominiumId: t.condominiumId, roles: ["syndic"], exclude: user.id }, { type: "ticket_reopened", vars: { ...vars, situacao: action === "cancel" ? "cancelado" : "reaberto" }, referenceType: "ticket", referenceId: id });
  }
  refresh(id);
  return { ok: true };
}
