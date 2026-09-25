"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, type CurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { nextProtocol } from "@/lib/orders";
import { readStored, saveFile } from "@/lib/storage";
import { PRIORITY_META, type Priority } from "@/lib/workflow";
import { FREQUENCIES, isDue, parseDays, spNow } from "@/lib/checklist";

export type ChecklistState = { error?: string; ok?: boolean; message?: string } | undefined;

/** Superadmin gerencia qualquer condomínio; síndico só o próprio. */
async function manager(condominiumId: string) {
  const user = await requireUser("superadmin", "syndic");
  if (user.role === "syndic" && user.condominiumId !== condominiumId) throw new Error("Sem permissão para este condomínio.");
  return user;
}

function refresh() {
  revalidatePath("/dashboard");
  revalidatePath("/checklist");
  revalidatePath("/estrutura");
  revalidatePath("/admin/condominios", "layout");
}

const fail = (e: unknown): ChecklistState => ({ error: e instanceof z.ZodError ? e.issues[0].message : e instanceof Error ? e.message : "Erro inesperado." });

// ───────────────────────────── Itens (síndico/superadmin) ─────────────────────────────

const itemSchema = z.object({
  title: z.string().trim().min(2, "Informe o item").max(120),
  description: z.string().trim().max(500).optional(),
  commonAreaId: z.string().optional(),
  frequency: z.enum(Object.keys(FREQUENCIES) as [keyof typeof FREQUENCIES, ...(keyof typeof FREQUENCIES)[]]),
});

export async function saveChecklistItem(condominiumId: string, id: string | null, _prev: ChecklistState, form: FormData): Promise<ChecklistState> {
  try {
    const user = await manager(condominiumId);
    const d = itemSchema.parse(Object.fromEntries([...form.entries()].filter(([k, v]) => v !== "" && k !== "weekdays")));
    const days = [...new Set(parseDays(form.getAll("weekdays").join(",")))].sort();
    if (d.frequency === "weekdays" && !days.length) return { error: "Escolha ao menos um dia da semana." };
    if (d.frequency === "weekly" && days.length !== 1) return { error: "Escolha o dia da semana." };
    if (d.commonAreaId && !(await db.commonArea.findFirst({ where: { id: d.commonAreaId, condominiumId } }))) return { error: "Área comum inválida." };
    const data = {
      title: d.title,
      description: d.description ?? null,
      commonAreaId: d.commonAreaId ?? null,
      frequency: d.frequency,
      weekdays: d.frequency === "daily" ? "" : days.join(","),
    };
    if (id) {
      const old = await db.checklistItem.findFirstOrThrow({ where: { id, condominiumId } });
      await db.checklistItem.update({ where: { id }, data });
      await audit(user, "update", "checklist_item", id, { old: { title: old.title, frequency: old.frequency, weekdays: old.weekdays }, new: data, condominiumId });
    } else {
      const last = await db.checklistItem.aggregate({ where: { condominiumId }, _max: { sortOrder: true } });
      const item = await db.checklistItem.create({ data: { ...data, condominiumId, sortOrder: (last._max.sortOrder ?? 0) + 1 } });
      await audit(user, "create", "checklist_item", item.id, { new: data, condominiumId });
    }
    refresh();
    return { ok: true, message: id ? "Item atualizado." : "Item adicionado." };
  } catch (e) {
    return fail(e);
  }
}

export async function toggleChecklistItem(condominiumId: string, id: string, _prev: ChecklistState): Promise<ChecklistState> {
  try {
    const user = await manager(condominiumId);
    const item = await db.checklistItem.findFirstOrThrow({ where: { id, condominiumId } });
    await db.checklistItem.update({ where: { id }, data: { active: !item.active } });
    await audit(user, item.active ? "deactivate" : "activate", "checklist_item", id, { condominiumId });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Sem histórico: exclui. Com conferências registradas: só pausa, para não apagar o histórico. */
export async function deleteChecklistItem(condominiumId: string, id: string, _prev: ChecklistState): Promise<ChecklistState> {
  try {
    const user = await manager(condominiumId);
    const item = await db.checklistItem.findFirstOrThrow({ where: { id, condominiumId }, include: { _count: { select: { checks: true } } } });
    if (item._count.checks) {
      await db.checklistItem.update({ where: { id }, data: { active: false } });
      await audit(user, "deactivate", "checklist_item", id, { condominiumId });
      refresh();
      return { ok: true, message: "O item tem histórico de conferências: foi pausado em vez de excluído." };
    }
    await db.checklistItem.delete({ where: { id } });
    await audit(user, "delete", "checklist_item", id, { old: { title: item.title }, condominiumId });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function moveChecklistItem(condominiumId: string, id: string, dir: -1 | 1) {
  await manager(condominiumId);
  const items = await db.checklistItem.findMany({ where: { condominiumId }, orderBy: [{ sortOrder: "asc" }, { title: "asc" }], select: { id: true } });
  const i = items.findIndex((x) => x.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= items.length) return;
  [items[i], items[j]] = [items[j], items[i]];
  await db.$transaction(items.map((x, n) => db.checklistItem.update({ where: { id: x.id }, data: { sortOrder: n + 1 } })));
  refresh();
}

export async function saveChecklistSettings(condominiumId: string, _prev: ChecklistState, form: FormData): Promise<ChecklistState> {
  try {
    const user = await manager(condominiumId);
    const v = String(form.get("deadline") ?? "").trim();
    if (v && !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) return { error: "Horário inválido." };
    await db.condominium.update({ where: { id: condominiumId }, data: { checklistDeadline: v || null, checklistAlertedOn: null } });
    await audit(user, "update", "checklist_settings", condominiumId, { new: { deadline: v || null }, condominiumId });
    refresh();
    return { ok: true, message: v ? `Alerta às ${v} se o checklist não estiver completo.` : "Alerta de horário desativado." };
  } catch (e) {
    return fail(e);
  }
}

// ───────────────────────────── Conferência (zelador, síndico, superadmin) ─────────────────────────────

async function checker(itemId: string) {
  const user = await requireUser("caretaker", "syndic", "superadmin");
  const item = await db.checklistItem.findUnique({ where: { id: itemId } });
  if (!item || (user.role !== "superadmin" && item.condominiumId !== user.condominiumId)) throw new Error("Item não encontrado.");
  return { user, item };
}

const checkSchema = z.object({
  status: z.enum(["ok", "issue"]),
  note: z.string().trim().max(500).optional(),
  photoUrl: z.string().optional(),
  openOrder: z.string().optional(),
  priority: z.enum(["urgent", "high", "medium", "low"]).optional(),
});

export async function checkItem(itemId: string, _prev: ChecklistState, form: FormData): Promise<ChecklistState> {
  try {
    const { user, item } = await checker(itemId);
    const d = checkSchema.parse(Object.fromEntries([...form.entries()].filter(([, v]) => v !== "")));
    const today = spNow(Date.now()).date;
    if (!item.active || !isDue(item, today)) return { error: "Este item não está no checklist de hoje." };
    if (d.status === "issue" && !d.note && !d.photoUrl) return { error: "Descreva o problema ou anexe uma foto." };
    if (d.photoUrl && !d.photoUrl.startsWith(`/api/media/checklist-${item.condominiumId}/`)) return { error: "Foto inválida." };

    const existing = await db.checklistCheck.findUnique({ where: { itemId_date: { itemId, date: today } } });
    const orderId = d.status === "issue" && d.openOrder === "on" && !existing?.serviceOrderId ? await openOrderFromCheck(user, item, d) : null;

    const data = { status: d.status, note: d.note ?? null, photoUrl: d.photoUrl ?? null, userId: user.id, checkedAt: new Date(), ...(orderId && { serviceOrderId: orderId.id }) };
    await db.checklistCheck.upsert({
      where: { itemId_date: { itemId, date: today } },
      create: { itemId, condominiumId: item.condominiumId, date: today, ...data },
      update: data,
    });
    await audit(user, "checklist_check", "checklist_item", itemId, { new: { date: today, status: d.status, note: d.note, order: orderId?.protocol }, condominiumId: item.condominiumId });

    if (d.status === "issue") {
      await notify(
        { condominiumId: item.condominiumId, roles: ["syndic"], exclude: user.id },
        {
          type: "checklist_issue",
          vars: { item: item.title, autor: user.name, observacao: d.note, protocolo: orderId?.protocol },
          ...(orderId ? { referenceType: "service_order", referenceId: orderId.id } : { referenceType: "checklist" }),
        },
      );
    }
    refresh();
    if (orderId) revalidatePath("/os");
    return { ok: true, message: orderId ? `Registrado. OS ${orderId.protocol} aberta.` : "Registrado." };
  } catch (e) {
    return fail(e);
  }
}

/** Abre uma OS a partir do problema encontrado (com a foto do checklist como registro da abertura). */
async function openOrderFromCheck(user: CurrentUser, item: { id: string; title: string; condominiumId: string; commonAreaId: string | null }, d: z.infer<typeof checkSchema>) {
  const priority = (d.priority ?? "medium") as Priority;
  const order = await db.$transaction(async (tx) => {
    const protocol = await nextProtocol(item.condominiumId, tx);
    const o = await tx.serviceOrder.create({
      data: {
        protocol,
        condominiumId: item.condominiumId,
        title: `Checklist: ${item.title}`.slice(0, 120),
        description: d.note || "Problema encontrado na conferência do checklist do dia.",
        priority,
        locationType: "common_area",
        commonAreaId: item.commonAreaId,
        locationNote: item.commonAreaId ? null : item.title,
        dueDate: new Date(Date.now() + PRIORITY_META[priority].hours * 3600_000),
        requestedById: user.id,
      },
    });
    await tx.serviceEvent.create({ data: { serviceOrderId: o.id, userId: user.id, type: "created", toStatus: "open", comment: "Ordem de serviço aberta a partir do checklist do dia." } });
    return o;
  });

  // Copia a foto do checklist para a OS (registro da ocorrência)
  if (d.photoUrl) {
    const [dir, name] = d.photoUrl.replace(/^\/api\/media\//, "").split("/");
    const f = await readStored([dir, name]);
    if (f) {
      const bytes = new Uint8Array(f.body instanceof Uint8Array ? f.body : await new Response(f.body).arrayBuffer());
      const url = await saveFile(new File([bytes], name, { type: f.mime }), order.id);
      await db.serviceMedia.create({
        data: { serviceOrderId: order.id, type: "photo", phase: "opening", url, mimeType: f.mime, sizeBytes: bytes.byteLength, uploadedById: user.id, metadata: JSON.stringify({ source: "checklist", itemId: item.id }) },
      });
    }
  }
  await audit(user, "create", "service_order", order.id, { new: { protocol: order.protocol, title: order.title, from: "checklist" }, condominiumId: item.condominiumId });
  return order;
}

/** Desfaz a conferência de hoje (quem conferiu ou síndico/superadmin). A OS aberta, se houver, continua. */
export async function uncheckItem(itemId: string, _prev: ChecklistState): Promise<ChecklistState> {
  try {
    const { user, item } = await checker(itemId);
    const today = spNow(Date.now()).date;
    const c = await db.checklistCheck.findUnique({ where: { itemId_date: { itemId, date: today } } });
    if (!c) return { ok: true };
    if (user.role === "caretaker" && c.userId !== user.id) return { error: "Só quem conferiu pode desfazer." };
    await db.checklistCheck.delete({ where: { id: c.id } });
    await audit(user, "checklist_uncheck", "checklist_item", itemId, { old: { date: today, status: c.status }, condominiumId: item.condominiumId });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
