"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { nextProtocol } from "@/lib/orders";
import type { Role } from "@/lib/roles";
import { can, canView, PRIORITY_META, STATUSES, STATUS_META, type OrderAction, type Priority, type Status } from "@/lib/workflow";
import { deleteFile, deleteFolder } from "@/lib/storage";

export type ActionState = { error?: string; ok?: boolean; id?: string } | undefined;

const fail = (error: string): ActionState => ({ error });

async function loadOrder(id: string) {
  return db.serviceOrder.findUnique({ where: { id }, include: { media: { select: { phase: true } } } });
}

function orderLink(id: string) {
  return { referenceType: "service_order", referenceId: id };
}

// ───────────────────────────── Criação ─────────────────────────────

const createSchema = z.object({
  title: z.string().trim().min(4, "Título muito curto").max(120),
  description: z.string().trim().min(10, "Descreva o problema com mais detalhes").max(4000),
  categoryId: z.string().optional(),
  priority: z.enum(["urgent", "high", "medium", "low"]),
  locationType: z.enum(["common_area", "unit"]),
  commonAreaId: z.string().optional(),
  unitId: z.string().optional(),
  locationNote: z.string().trim().max(200).optional(),
  dueDate: z.string().optional(),
  condominiumId: z.string().optional(),
});

export async function createOrder(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser("superadmin", "syndic", "caretaker", "council");
  const parsed = createSchema.safeParse(Object.fromEntries([...form.entries()].filter(([, v]) => v !== "")));
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const d = parsed.data;

  const condominiumId = user.role === "superadmin" ? d.condominiumId : user.condominiumId;
  if (!condominiumId) return fail("Selecione o condomínio.");

  // Garantir que categoria/local pertencem ao condomínio
  if (d.categoryId && !(await db.serviceCategory.findFirst({ where: { id: d.categoryId, condominiumId } }))) return fail("Categoria inválida.");
  if (d.locationType === "common_area") {
    if (!d.commonAreaId || !(await db.commonArea.findFirst({ where: { id: d.commonAreaId, condominiumId } }))) return fail("Selecione a área comum.");
  } else {
    if (!d.unitId) return fail("Selecione a unidade.");
    const unit = await db.unit.findFirst({ where: { id: d.unitId, building: { condominiumId } } });
    if (!unit) return fail("Unidade inválida.");
    if (user.role === "council" && !user.units.some((u) => u.unitId === d.unitId)) return fail("Você só pode abrir solicitações para a sua unidade.");
  }

  // Moradores não definem prazo — o SLA vem da prioridade
  const due =
    d.dueDate && user.role !== "council"
      ? new Date(`${d.dueDate}T18:00:00`)
      : new Date(Date.now() + PRIORITY_META[d.priority as Priority].hours * 3600_000);

  const order = await db.$transaction(async (tx) => {
    const protocol = await nextProtocol(condominiumId, tx);
    const o = await tx.serviceOrder.create({
      data: {
        protocol,
        condominiumId,
        title: d.title,
        description: d.description,
        categoryId: d.categoryId || null,
        priority: d.priority,
        locationType: d.locationType,
        commonAreaId: d.locationType === "common_area" ? d.commonAreaId : null,
        unitId: d.locationType === "unit" ? d.unitId : null,
        locationNote: d.locationNote || null,
        dueDate: due,
        requestedById: user.id,
      },
    });
    await tx.serviceEvent.create({ data: { serviceOrderId: o.id, userId: user.id, type: "created", toStatus: "open", comment: "Ordem de serviço aberta." } });
    return o;
  });

  await audit(user, "create", "service_order", order.id, { new: { protocol: order.protocol, title: order.title }, condominiumId });
  await notify(
    { condominiumId, roles: ["syndic", "caretaker"], exclude: user.id },
    {
      type: user.role === "council" ? "council_request" : "os_created",
      title: user.role === "council" ? "Nova solicitação do conselho" : "Nova OS aberta",
      message: `${order.protocol} · ${order.title}`,
      ...orderLink(order.id),
    },
  );
  revalidatePath("/os");
  return { ok: true, id: order.id };
}

// ───────────────────────────── Atribuição ─────────────────────────────

export async function assignOrder(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser("superadmin", "syndic");
  const o = await loadOrder(id);
  if (!o || !can("assign", o, user)) return fail("Ação não permitida.");

  const providerId = String(form.get("providerId") ?? "");
  const provider = await db.user.findFirst({ where: { id: providerId, role: "provider", status: "active", condominiumId: o.condominiumId } });
  if (!provider) return fail("Selecione um prestador.");
  const dueRaw = String(form.get("dueDate") ?? "");
  const dueDate = dueRaw ? new Date(`${dueRaw}T18:00:00`) : o.dueDate;
  const note = String(form.get("comment") ?? "").trim();

  const toStatus: Status = o.status === "rejected" ? "rejected" : "assigned";
  await db.$transaction([
    db.serviceOrder.update({ where: { id }, data: { assignedToId: provider.id, assignedAt: new Date(), dueDate, status: toStatus } }),
    db.serviceEvent.create({
      data: { serviceOrderId: id, userId: user.id, type: "assignment", fromStatus: o.status, toStatus, comment: `Atribuída a ${provider.name}${provider.company ? ` (${provider.company})` : ""}.${note ? ` ${note}` : ""}` },
    }),
  ]);
  await audit(user, "assign", "service_order", id, { old: { assignedToId: o.assignedToId }, new: { assignedToId: provider.id, dueDate }, condominiumId: o.condominiumId });
  await notify(
    { condominiumId: o.condominiumId, roles: ["syndic", "caretaker"], userIds: [provider.id], exclude: user.id },
    { type: "os_assigned", title: "OS atribuída", message: `${o.protocol} · ${o.title} → ${provider.name}`, ...orderLink(id) },
  );
  revalidatePath(`/os/${id}`);
  return { ok: true };
}

// ───────────────────────────── Transições ─────────────────────────────

type Transition = {
  action: OrderAction;
  to: Status;
  event: string;
  requireComment?: boolean;
  defaultComment: string;
  notify: (o: { requestedById: string | null; assignedToId: string | null }) => { roles?: Role[]; userIds?: (string | null)[] };
  title: string;
};

const TRANSITIONS: Record<"start" | "validate" | "return" | "approve" | "reject" | "cancel", Transition> = {
  start: {
    action: "start", to: "in_progress", event: "status_change", defaultComment: "Serviço iniciado.",
    notify: () => ({ roles: ["syndic", "caretaker"] }), title: "OS em andamento",
  },
  validate: {
    action: "validate", to: "validated", event: "validation", defaultComment: "Serviço conferido e validado.",
    notify: (o) => ({ roles: ["syndic"], userIds: [o.assignedToId] }), title: "OS validada pelo zelador",
  },
  return: {
    action: "return", to: "rejected", event: "rejection", requireComment: true, defaultComment: "",
    notify: (o) => ({ roles: ["syndic"], userIds: [o.assignedToId] }), title: "OS devolvida para ajustes",
  },
  approve: {
    action: "approve", to: "approved", event: "approval", defaultComment: "Serviço aprovado e publicado no feed.",
    notify: (o) => ({ roles: ["caretaker", "council"], userIds: [o.assignedToId, o.requestedById] }), title: "Serviço aprovado",
  },
  reject: {
    action: "reject", to: "rejected", event: "rejection", requireComment: true, defaultComment: "",
    notify: (o) => ({ roles: ["caretaker"], userIds: [o.assignedToId] }), title: "OS rejeitada pelo síndico",
  },
  cancel: {
    action: "cancel", to: "cancelled", event: "status_change", requireComment: true, defaultComment: "",
    notify: (o) => ({ roles: ["syndic", "caretaker"], userIds: [o.assignedToId, o.requestedById] }), title: "OS cancelada",
  },
};

export async function transitionOrder(id: string, kind: keyof typeof TRANSITIONS, _: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const t = TRANSITIONS[kind];
  const o = await loadOrder(id);
  if (!o || !can(t.action, o, user)) return fail("Ação não permitida para o status atual.");

  const comment = String(form.get("comment") ?? "").trim();
  if (t.requireComment && comment.length < 5) return fail("Descreva o motivo (mín. 5 caracteres).");
  if (kind === "start" && !o.media.some((m) => m.phase === "before")) return fail("Anexe ao menos uma foto do ANTES para iniciar o serviço.");

  const now = new Date();
  const stamp: Record<string, unknown> = {};
  if (kind === "start") stamp.startedAt = o.startedAt ?? now;
  if (kind === "validate") Object.assign(stamp, { validatedAt: now, validatedById: user.id });
  if (kind === "approve") Object.assign(stamp, { approvedAt: now, approvedById: user.id, validatedById: o.validatedById ?? user.id, validatedAt: o.validatedAt ?? now });

  await db.$transaction([
    db.serviceOrder.update({ where: { id }, data: { status: t.to, ...stamp } }),
    db.serviceEvent.create({ data: { serviceOrderId: id, userId: user.id, type: t.event, fromStatus: o.status, toStatus: t.to, comment: comment || t.defaultComment } }),
  ]);
  await audit(user, kind, "service_order", id, { old: { status: o.status }, new: { status: t.to, comment }, condominiumId: o.condominiumId });

  const target = t.notify(o);
  await notify(
    { condominiumId: o.condominiumId, roles: target.roles, userIds: target.userIds, exclude: user.id },
    { type: `os_${t.to}`, title: t.title, message: `${o.protocol} · ${o.title}${comment ? ` — “${comment}”` : ""}`, ...orderLink(id) },
  );
  revalidatePath(`/os/${id}`);
  revalidatePath("/feed");
  return { ok: true };
}

// ───────────────────────────── Conclusão (prestador) ─────────────────────────────

export async function completeOrder(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser("provider");
  const o = await loadOrder(id);
  if (!o || !can("complete", o, user)) return fail("Ação não permitida.");
  if (!o.media.some((m) => m.phase === "after")) return fail("Anexe ao menos uma foto do DEPOIS antes de concluir.");

  const report = String(form.get("serviceReport") ?? "").trim();
  if (report.length < 10) return fail("Descreva o serviço realizado (mín. 10 caracteres).");
  const minutes = Number(form.get("executionMinutes") ?? 0);
  const materials = String(form.get("materials") ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [item, qty] = l.split(/\s*[;|]\s*/);
      return { item, qty: qty ?? "" };
    });

  await db.$transaction([
    db.serviceOrder.update({
      where: { id },
      data: {
        status: "completed",
        completedAt: new Date(),
        serviceReport: report,
        executionMinutes: Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : null,
        materialsUsed: JSON.stringify(materials),
      },
    }),
    db.serviceEvent.create({ data: { serviceOrderId: id, userId: user.id, type: "status_change", fromStatus: o.status, toStatus: "completed", comment: report } }),
  ]);
  await audit(user, "complete", "service_order", id, { new: { status: "completed" }, condominiumId: o.condominiumId });
  await notify(
    { condominiumId: o.condominiumId, roles: ["syndic", "caretaker"] },
    { type: "os_completed", title: "OS concluída — aguardando validação", message: `${o.protocol} · ${o.title}`, ...orderLink(id) },
  );
  revalidatePath(`/os/${id}`);
  return { ok: true };
}

// ───────────────────────────── Comentário / Avaliação / Mídia ─────────────────────────────

export async function commentOrder(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const o = await loadOrder(id);
  if (!o || user.role === "resident" || !canView(o, user) || (user.role === "council" && o.requestedById !== user.id)) return fail("Ação não permitida.");
  const comment = String(form.get("comment") ?? "").trim();
  if (!comment) return fail("Escreva um comentário.");
  await db.serviceEvent.create({ data: { serviceOrderId: id, userId: user.id, type: "comment", comment: comment.slice(0, 2000) } });
  await notify(
    { condominiumId: o.condominiumId, roles: ["syndic"], userIds: [o.assignedToId, o.requestedById], exclude: user.id },
    { type: "os_comment", title: `Novo comentário de ${user.name}`, message: `${o.protocol} · ${comment.slice(0, 120)}`, ...orderLink(id) },
  );
  revalidatePath(`/os/${id}`);
  return { ok: true };
}

export async function rateOrder(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const o = await loadOrder(id);
  if (!o || !can("rate", o, user)) return fail("Ação não permitida.");
  const rating = Number(form.get("rating"));
  if (!(rating >= 1 && rating <= 5)) return fail("Escolha de 1 a 5 estrelas.");
  const comment = String(form.get("ratingComment") ?? "").trim().slice(0, 500);
  await db.$transaction([
    db.serviceOrder.update({ where: { id }, data: { rating, ratingComment: comment || null } }),
    db.serviceEvent.create({ data: { serviceOrderId: id, userId: user.id, type: "rating", comment: `Avaliação ${rating}/5${comment ? ` — ${comment}` : ""}` } }),
  ]);
  revalidatePath(`/os/${id}`);
  return { ok: true };
}

export async function deleteMedia(mediaId: string) {
  const user = await requireUser();
  const m = await db.serviceMedia.findUnique({ where: { id: mediaId }, include: { serviceOrder: true } });
  if (!m) return;
  const phaseAction = m.phase === "after" ? "upload_after" : "upload_before";
  const allowed = m.uploadedById === user.id && (m.phase === "opening" ? m.serviceOrder.status === "open" : can(phaseAction, m.serviceOrder, user));
  if (!allowed) return;
  await db.serviceMedia.delete({ where: { id: mediaId } });
  await deleteFile(m.url);
  await audit(user, "delete_media", "service_media", mediaId, { old: { url: m.url, phase: m.phase }, condominiumId: m.serviceOrder.condominiumId });
  revalidatePath(`/os/${m.serviceOrderId}`);
}


// ───────────────────────────── Superadmin: edição completa e exclusão ─────────────────────────────

const editSchema = createSchema.omit({ condominiumId: true }).extend({
  status: z.enum(STATUSES),
  assignedToId: z.string().optional(),
  serviceReport: z.string().trim().max(4000).optional(),
  executionMinutes: z.coerce.number().int().min(0).max(100000).optional(),
  reason: z.string().trim().max(500).optional(),
});

export async function adminUpdateOrder(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser("superadmin");
  const o = await db.serviceOrder.findUnique({ where: { id } });
  if (!o) return fail("OS não encontrada.");
  const parsed = editSchema.safeParse(Object.fromEntries([...form.entries()].filter(([, v]) => v !== "")));
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const d = parsed.data;
  const cid = o.condominiumId;

  if (d.categoryId && !(await db.serviceCategory.findFirst({ where: { id: d.categoryId, condominiumId: cid } }))) return fail("Categoria inválida.");
  if (d.locationType === "common_area" && (!d.commonAreaId || !(await db.commonArea.findFirst({ where: { id: d.commonAreaId, condominiumId: cid } })))) return fail("Selecione a área comum.");
  if (d.locationType === "unit" && (!d.unitId || !(await db.unit.findFirst({ where: { id: d.unitId, building: { condominiumId: cid } } })))) return fail("Selecione a unidade.");
  const provider = d.assignedToId ? await db.user.findFirst({ where: { id: d.assignedToId, role: "provider", condominiumId: cid } }) : null;
  if (d.assignedToId && !provider) return fail("Prestador inválido.");
  if (provider && provider.id !== o.assignedToId && provider.status !== "active") return fail("Este prestador está inativo. Escolha um prestador ativo.");

  const now = new Date();
  const data = {
    title: d.title,
    description: d.description,
    categoryId: d.categoryId ?? null,
    priority: d.priority,
    locationType: d.locationType,
    commonAreaId: d.locationType === "common_area" ? d.commonAreaId : null,
    unitId: d.locationType === "unit" ? d.unitId : null,
    locationNote: d.locationNote ?? null,
    // O campo só tem o dia: mantém o horário original se o dia não mudou
    dueDate: !d.dueDate ? null : o.dueDate?.toISOString().slice(0, 10) === d.dueDate ? o.dueDate : new Date(`${d.dueDate}T18:00:00`),
    assignedToId: provider?.id ?? null,
    assignedAt: provider && provider.id !== o.assignedToId ? now : provider ? o.assignedAt : null,
    serviceReport: d.serviceReport ?? null,
    executionMinutes: d.executionMinutes ?? null,
    status: d.status,
    // Ao forçar um status, preenche os marcos que ainda estiverem vazios
    ...(d.status !== o.status && {
      ...(["in_progress", "completed", "validated", "approved"].includes(d.status) && { startedAt: o.startedAt ?? now }),
      ...(["completed", "validated", "approved"].includes(d.status) && { completedAt: o.completedAt ?? now }),
      ...(["validated", "approved"].includes(d.status) && { validatedAt: o.validatedAt ?? now, validatedById: o.validatedById ?? user.id }),
      ...(d.status === "approved" && { approvedAt: o.approvedAt ?? now, approvedById: o.approvedById ?? user.id }),
    }),
  };

  const changed = (Object.keys(data) as (keyof typeof data)[]).filter((k) => {
    const before = o[k as keyof typeof o];
    const after = data[k];
    return String(before instanceof Date ? before.toISOString() : before ?? "") !== String(after instanceof Date ? after.toISOString() : after ?? "");
  });
  if (!changed.length) return { ok: true, id };

  const LABEL: Partial<Record<keyof typeof data, string>> = {
    title: "título", description: "descrição", categoryId: "categoria", priority: "prioridade", locationType: "local", commonAreaId: "local", unitId: "local",
    locationNote: "complemento", dueDate: "prazo", assignedToId: "prestador", serviceReport: "relatório", executionMinutes: "tempo de execução", status: "status",
  };
  const fieldsChanged = [...new Set(changed.map((k) => LABEL[k]).filter(Boolean))];
  const reason = d.reason ? ` Motivo: ${d.reason}` : "";

  await db.$transaction([
    db.serviceOrder.update({ where: { id }, data }),
    db.serviceEvent.create({
      data: {
        serviceOrderId: id,
        userId: user.id,
        type: d.status !== o.status ? "status_change" : "comment",
        fromStatus: d.status !== o.status ? o.status : null,
        toStatus: d.status !== o.status ? d.status : null,
        comment: `OS editada pela administração (${fieldsChanged.join(", ")}).${reason}`,
      },
    }),
  ]);
  await audit(user, "admin_update", "service_order", id, {
    old: Object.fromEntries(changed.map((k) => [k, o[k as keyof typeof o]])),
    new: { ...Object.fromEntries(changed.map((k) => [k, data[k]])), reason: d.reason },
    condominiumId: cid,
  });
  if (d.status !== o.status || (provider && provider.id !== o.assignedToId)) {
    await notify(
      { condominiumId: cid, roles: ["syndic", "caretaker"], userIds: [provider?.id, o.requestedById], exclude: user.id },
      { type: "os_admin_update", title: "OS alterada pela administração", message: `${o.protocol} · ${d.title} — ${STATUS_META[d.status].label}`, ...orderLink(id) },
    );
  }
  revalidatePath(`/os/${id}`);
  revalidatePath("/os");
  revalidatePath("/feed");
  return { ok: true, id };
}

export async function adminDeleteOrder(id: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser("superadmin");
  const o = await db.serviceOrder.findUnique({ where: { id }, include: { _count: { select: { media: true, events: true } } } });
  if (!o) return fail("OS não encontrada.");
  if (String(form.get("confirm") ?? "").trim().toUpperCase() !== o.protocol) return fail(`Digite ${o.protocol} para confirmar.`);
  await db.serviceOrder.delete({ where: { id } });
  await deleteFolder(id);
  await db.notification.deleteMany({ where: { referenceType: "service_order", referenceId: id } });
  await audit(user, "delete", "service_order", id, {
    old: { protocol: o.protocol, title: o.title, status: o.status, media: o._count.media, events: o._count.events },
    condominiumId: o.condominiumId,
  });
  revalidatePath("/os");
  revalidatePath("/feed");
  redirect("/os?excluida=" + encodeURIComponent(o.protocol));
}
