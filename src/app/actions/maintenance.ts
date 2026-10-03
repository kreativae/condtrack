"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, type CurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { inCondo } from "@/lib/memberships";
import { spNow, addDays } from "@/lib/checklist";
import { PLAN_SUGGESTIONS, advance, periodDays } from "@/lib/maintenance";
import { openPlanOrder } from "@/lib/maintenance-server";

export type PlanState = { error?: string } | undefined;

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data.");
const schema = z.object({
  kind: z.enum(["service", "document"]),
  title: z.string().trim().min(2, "Informe o nome.").max(120),
  description: z.string().trim().max(1000).default(""),
  categoryId: z.string().optional(),
  commonAreaId: z.string().optional(),
  providerId: z.string().optional(),
  priority: z.enum(["urgent", "high", "medium", "low"]).default("medium"),
  every: z.coerce.number().int().min(1, "Periodicidade inválida.").max(60, "Periodicidade inválida."),
  unit: z.enum(["week", "month", "year"]),
  nextDue: ymd,
  leadDays: z.coerce.number().int().min(0, "Antecedência inválida.").max(365, "Antecedência de no máximo 365 dias."),
  active: z.string().optional(),
});

/** Superadmin e síndico gerenciam; o plano precisa ser do condomínio de quem pede (superadmin: qualquer um). */
async function manager() {
  return requireUser("superadmin", "syndic");
}
async function ownPlan(user: CurrentUser, id: string) {
  const p = await db.maintenancePlan.findUnique({ where: { id } });
  if (!p || (user.role !== "superadmin" && p.condominiumId !== user.condominiumId)) return null;
  return p;
}

export async function savePlan(id: string | null, _: PlanState, form: FormData): Promise<PlanState> {
  const user = await manager();
  const parsed = schema.safeParse(Object.fromEntries([...form.entries()].filter(([, v]) => v !== "")));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  const existing = id ? await ownPlan(user, id) : null;
  if (id && !existing) return { error: "Plano não encontrado." };
  const condominiumId = existing?.condominiumId ?? (user.role === "superadmin" ? String(form.get("condominiumId") ?? "") : user.condominiumId);
  if (!condominiumId || !(await db.condominium.findUnique({ where: { id: condominiumId }, select: { id: true } }))) return { error: "Escolha o condomínio." };

  // Antecedência menor que o ciclo (senão a próxima OS abriria logo em seguida)
  if (d.leadDays >= periodDays(d.every, d.unit)) return { error: "A antecedência precisa ser menor que o intervalo entre as datas." };

  const service = d.kind === "service";
  if (service && d.categoryId && !(await db.serviceCategory.findFirst({ where: { id: d.categoryId, condominiumId } }))) return { error: "Categoria inválida." };
  if (service && d.commonAreaId && !(await db.commonArea.findFirst({ where: { id: d.commonAreaId, condominiumId } }))) return { error: "Área inválida." };
  if (service && d.providerId && !(await db.user.findFirst({ where: { id: d.providerId, status: "active", ...inCondo(condominiumId, ["provider"]) } }))) return { error: "Prestador inválido." };

  const data = {
    kind: d.kind,
    title: d.title,
    description: d.description,
    categoryId: service ? d.categoryId || null : null,
    commonAreaId: service ? d.commonAreaId || null : null,
    providerId: service ? d.providerId || null : null,
    priority: d.priority,
    every: d.every,
    unit: d.unit,
    nextDue: d.nextDue,
    leadDays: d.leadDays,
    active: d.active === "on",
    // Data mudou: os avisos do documento recomeçam
    ...(existing && existing.nextDue !== d.nextDue ? { alertedFor: null } : {}),
  };
  const plan = existing
    ? await db.maintenancePlan.update({ where: { id: existing.id }, data })
    : await db.maintenancePlan.create({ data: { ...data, condominiumId, createdById: user.id } });
  await audit(user, existing ? "update" : "create", "maintenance_plan", plan.id, {
    old: existing ? { title: existing.title, nextDue: existing.nextDue, every: existing.every, unit: existing.unit, active: existing.active } : undefined,
    new: { title: plan.title, kind: plan.kind, nextDue: plan.nextDue, every: plan.every, unit: plan.unit, active: plan.active },
    condominiumId,
  });
  revalidatePath("/manutencao");
  redirect("/manutencao");
}

export async function togglePlan(id: string) {
  const user = await manager();
  const p = await ownPlan(user, id);
  if (!p) return;
  await db.maintenancePlan.update({ where: { id }, data: { active: !p.active } });
  await audit(user, p.active ? "deactivate" : "activate", "maintenance_plan", id, { condominiumId: p.condominiumId });
  revalidatePath("/manutencao");
}

export async function deletePlan(id: string) {
  const user = await manager();
  const p = await ownPlan(user, id);
  if (!p) return;
  await db.maintenancePlan.delete({ where: { id } });
  await audit(user, "delete", "maintenance_plan", id, { old: { title: p.title, kind: p.kind, nextDue: p.nextDue }, condominiumId: p.condominiumId });
  revalidatePath("/manutencao");
  redirect("/manutencao");
}

/** Abre agora a OS do próximo ciclo (sem esperar a antecedência). */
export async function openPlanOrderNow(id: string) {
  const user = await manager();
  const p = await ownPlan(user, id);
  if (!p || p.kind !== "service") return;
  const order = await openPlanOrder(p.id, { id: user.id, name: user.name });
  if (!order) return;
  await audit(user, "create", "service_order", order.id, { new: { protocol: order.protocol, title: order.title, origem: "manutenção preventiva" }, condominiumId: p.condominiumId });
  revalidatePath("/manutencao");
  redirect(`/os/${order.id}`);
}

/** Documento renovado: o vencimento passa para a nova data (ou um ciclo à frente) e os avisos recomeçam. */
export async function renewDocument(id: string, form: FormData) {
  const user = await manager();
  const p = await ownPlan(user, id);
  if (!p || p.kind !== "document") return;
  const raw = String(form.get("nextDue") ?? "");
  const nextDue = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : advance(p.nextDue, p.every, p.unit);
  await db.maintenancePlan.update({ where: { id }, data: { nextDue, alertedFor: null, active: true } });
  await audit(user, "renew", "maintenance_plan", id, { old: { nextDue: p.nextDue }, new: { nextDue }, condominiumId: p.condominiumId });
  revalidatePath("/manutencao");
}

/**
 * Cria os planos sugeridos que ainda não existem. Entram PAUSADOS e com datas provisórias:
 * nada é aberto nem avisado até o síndico conferir a data de cada um e ativar.
 */
export async function addSuggestedPlans(condominiumId: string) {
  const user = await manager();
  const cid = user.role === "superadmin" ? condominiumId : user.condominiumId;
  if (!cid) return;
  const [existing, cats] = await Promise.all([
    db.maintenancePlan.findMany({ where: { condominiumId: cid }, select: { title: true } }),
    db.serviceCategory.findMany({ where: { condominiumId: cid }, select: { id: true, name: true } }),
  ]);
  const have = new Set(existing.map((e) => e.title.toLowerCase()));
  const today = spNow(Date.now()).date;
  const rows = PLAN_SUGGESTIONS.filter((s) => !have.has(s.title.toLowerCase())).map((s) => ({
    condominiumId: cid,
    kind: s.kind,
    title: s.title,
    description: s.description,
    categoryId: cats.find((c) => c.name.toLowerCase() === s.category?.toLowerCase())?.id ?? null,
    every: s.every,
    unit: s.unit,
    leadDays: s.leadDays,
    nextDue: addDays(today, s.leadDays + 30),
    active: false,
    createdById: user.id,
  }));
  if (rows.length) await db.maintenancePlan.createMany({ data: rows });
  await audit(user, "create", "maintenance_plan", null, { new: { sugestoes: rows.map((r) => r.title) }, condominiumId: cid });
  revalidatePath("/manutencao");
}
