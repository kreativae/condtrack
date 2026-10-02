"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, type CurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { stripeConfigured } from "@/lib/stripe";
import { changePlan, createCheckout, createPortal, ensureStripePrices, setCancelAtPeriodEnd, syncCondominium } from "@/lib/billing";
import type { Interval } from "@/lib/billing-shared";
import { applyDealToSubscription, createDealCheckout, getDeal } from "@/lib/billing-deal";
import { parseBRL } from "@/lib/finance";

export type BillingState = { error?: string; ok?: boolean; message?: string } | undefined;

const intervalSchema = z.enum(["month", "year"]);

function errMessage(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.includes("STRIPE_SECRET_KEY") ? "Stripe ainda não está configurado nesta instalação." : `Não foi possível concluir no Stripe: ${msg}`;
}

/** Plano precisa comportar as unidades cadastradas. */
async function checkUnitLimit(condominiumId: string, planId: string) {
  const [plan, units] = await Promise.all([
    db.plan.findUnique({ where: { id: planId } }),
    db.unit.count({ where: { building: { condominiumId } } }),
  ]);
  if (!plan || !plan.active) return "Plano indisponível.";
  if (plan.maxUnits != null && units > plan.maxUnits) return `O plano ${plan.name} comporta até ${plan.maxUnits} unidades; este condomínio tem ${units}.`;
  return null;
}

function revalidateBilling() {
  revalidatePath("/assinatura");
  revalidatePath("/admin/assinaturas");
}

// ───────────────────────────── Síndico ─────────────────────────────

/** Superadmin em "visualizar como" síndico também opera — auditado com actorId. */
async function syndic() {
  return (await requireUser("syndic")) as CurrentUser & { condominiumId: string };
}

export async function startCheckout(planId: string, interval: Interval) {
  const user = await syndic();
  if (!(await stripeConfigured())) redirect("/assinatura?erro=stripe");
  if ((await getDeal(user.condominiumId))?.active) redirect(`/assinatura?erro=${encodeURIComponent("Este condomínio tem uma negociação especial: assine por ela.")}`);
  const limit = await checkUnitLimit(user.condominiumId, planId);
  if (limit) redirect(`/assinatura?erro=${encodeURIComponent(limit)}`);
  let url: string;
  try {
    url = await createCheckout(user.condominiumId, planId, intervalSchema.parse(interval));
  } catch (e) {
    redirect(`/assinatura?erro=${encodeURIComponent(errMessage(e))}`);
  }
  await audit(user, "billing_checkout_started", "subscription", null, { new: { planId, interval } });
  redirect(url);
}

export async function openPortal() {
  const user = await syndic();
  let url: string;
  try {
    url = await createPortal(user.condominiumId);
  } catch (e) {
    redirect(`/assinatura?erro=${encodeURIComponent(errMessage(e))}`);
  }
  redirect(url);
}

export async function switchPlan(planId: string, interval: Interval, _prev: BillingState): Promise<BillingState> {
  const user = await syndic();
  const limit = await checkUnitLimit(user.condominiumId, planId);
  if (limit) return { error: limit };
  try {
    const before = await db.subscription.findUnique({ where: { condominiumId: user.condominiumId } });
    await changePlan(user.condominiumId, planId, intervalSchema.parse(interval));
    await audit(user, "billing_plan_changed", "subscription", before?.id, { old: { planId: before?.planId, interval: before?.interval }, new: { planId, interval } });
  } catch (e) {
    return { error: errMessage(e) };
  }
  revalidateBilling();
  return { ok: true, message: "Plano alterado. A diferença será cobrada ou creditada proporcionalmente na próxima fatura." };
}

export async function cancelMySubscription() {
  const user = await syndic();
  await setCancelAtPeriodEnd(user.condominiumId, true);
  await audit(user, "billing_cancel_scheduled", "subscription");
  revalidateBilling();
}

export async function resumeMySubscription() {
  const user = await syndic();
  await setCancelAtPeriodEnd(user.condominiumId, false);
  await audit(user, "billing_cancel_reverted", "subscription");
  revalidateBilling();
}

export async function syncMySubscription() {
  const user = await syndic();
  await syncCondominium(user.condominiumId);
  revalidateBilling();
}

// ───────────────────────────── Superadmin ─────────────────────────────

const planSchema = z.object({
  name: z.string().trim().min(2),
  description: z.string().trim().max(200).optional(),
  maxUnits: z.coerce.number().int().positive().optional(),
  monthlyPrice: z.coerce.number().positive("Informe o valor mensal"),
  yearlyPrice: z.coerce.number().positive("Informe o valor anual"),
  features: z.string().optional(),
  active: z.literal("on").optional(),
});

export async function savePlan(id: string, _prev: BillingState, form: FormData): Promise<BillingState> {
  const me = await requireUser("superadmin");
  const parsed = planSchema.safeParse(Object.fromEntries([...form.entries()].filter(([, v]) => v !== "")));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const old = await db.plan.findUniqueOrThrow({ where: { id } });
  const data = {
    name: d.name,
    description: d.description ?? null,
    maxUnits: d.maxUnits ?? null,
    monthlyPrice: Math.round(d.monthlyPrice * 100),
    yearlyPrice: Math.round(d.yearlyPrice * 100),
    features: JSON.stringify((d.features ?? "").split("\n").map((f) => f.trim()).filter(Boolean)),
    active: d.active === "on",
  };
  await db.plan.update({ where: { id }, data });
  await audit(me, "plan_updated", "plan", id, { old, new: data });
  if ((await stripeConfigured())) {
    try {
      await ensureStripePrices(id);
    } catch (e) {
      return { error: `Salvo localmente, mas houve erro ao sincronizar com o Stripe: ${errMessage(e)}` };
    }
  }
  revalidateBilling();
  revalidatePath("/admin/assinaturas/planos");
  return { ok: true, message: (await stripeConfigured()) ? "Plano salvo e sincronizado com o Stripe. Assinaturas atuais mantêm o preço antigo até serem migradas." : "Plano salvo (Stripe não configurado)." };
}

export async function syncPlansWithStripe(_prev: BillingState): Promise<BillingState> {
  const me = await requireUser("superadmin");
  if (!(await stripeConfigured())) return { error: "Stripe não configurado." };
  try {
    const plans = await db.plan.findMany();
    for (const p of plans) await ensureStripePrices(p.id);
  } catch (e) {
    return { error: errMessage(e) };
  }
  await audit(me, "plans_synced", "plan");
  revalidatePath("/admin/assinaturas/planos");
  return { ok: true, message: "Produtos e preços sincronizados com o Stripe." };
}

export async function adminChangePlan(condominiumId: string, _prev: BillingState, form: FormData): Promise<BillingState> {
  const me = await requireUser("superadmin");
  const planId = String(form.get("planId") ?? "");
  const interval = intervalSchema.safeParse(form.get("interval"));
  if (!interval.success) return { error: "Periodicidade inválida." };
  const limit = await checkUnitLimit(condominiumId, planId);
  if (limit) return { error: limit };
  try {
    await changePlan(condominiumId, planId, interval.data);
  } catch (e) {
    return { error: errMessage(e) };
  }
  await audit(me, "billing_plan_changed", "subscription", null, { new: { planId, interval: interval.data }, condominiumId });
  revalidateBilling();
  return { ok: true, message: "Plano alterado." };
}

export async function adminSetCancel(condominiumId: string, cancel: boolean) {
  const me = await requireUser("superadmin");
  await setCancelAtPeriodEnd(condominiumId, cancel);
  await audit(me, cancel ? "billing_cancel_scheduled" : "billing_cancel_reverted", "subscription", null, { condominiumId });
  revalidateBilling();
}

export async function adminSync(condominiumId: string) {
  await requireUser("superadmin");
  await syncCondominium(condominiumId);
  revalidateBilling();
}

export async function adminSyncAll(_prev: BillingState): Promise<BillingState> {
  const me = await requireUser("superadmin");
  if (!(await stripeConfigured())) return { error: "Stripe não configurado." };
  const subs = await db.subscription.findMany({ where: { stripeCustomerId: { not: null } }, select: { condominiumId: true } });
  try {
    for (const s of subs) await syncCondominium(s.condominiumId);
  } catch (e) {
    return { error: errMessage(e) };
  }
  await audit(me, "billing_synced_all", "subscription");
  revalidateBilling();
  return { ok: true, message: `${subs.length} assinatura(s) sincronizada(s).` };
}

// ───────────────────────────── Negociação especial (preço por unidade) ─────────────────────────────

/** Síndico assina a negociação especial do condomínio (Checkout do Stripe). */
export async function startDealCheckout(interval: Interval) {
  const user = await syndic();
  if (!(await stripeConfigured())) redirect("/assinatura?erro=stripe");
  let url: string;
  try {
    url = await createDealCheckout(user.condominiumId, intervalSchema.parse(interval));
  } catch (e) {
    redirect(`/assinatura?erro=${encodeURIComponent(errMessage(e))}`);
  }
  await audit(user, "billing_checkout_started", "subscription", null, { new: { deal: true, interval } });
  redirect(url);
}

/** Síndico troca entre mensal e anual na negociação (com proporcional). */
export async function switchDealInterval(_prev: BillingState, form: FormData): Promise<BillingState> {
  const user = await syndic();
  const interval = form.get("interval") === "year" ? "year" : "month";
  try {
    await applyDealToSubscription(user.condominiumId, intervalSchema.parse(interval));
  } catch (e) {
    return { error: errMessage(e) };
  }
  await audit(user, "billing_plan_changed", "subscription", null, { new: { deal: true, interval } });
  revalidateBilling();
  return { ok: true, message: interval === "year" ? "Agora a cobrança é anual." : "Agora a cobrança é mensal." };
}

const dealSchema = z.object({
  monthly: z.string(),
  yearly: z.string(),
  minUnits: z.coerce.number().int().min(0, "Mínimo inválido.").max(100000),
  trialDays: z.coerce.number().int().min(0, "Dias de teste inválidos.").max(90, "No máximo 90 dias de teste."),
  notes: z.string().trim().max(1000).optional(),
  active: z.string().optional(),
  apply: z.string().optional(),
});

/** Superadmin cria ou edita a negociação especial de um condomínio. */
export async function saveDeal(condominiumId: string, _prev: BillingState, form: FormData): Promise<BillingState> {
  const me = await requireUser("superadmin");
  const d = dealSchema.safeParse(Object.fromEntries(form));
  if (!d.success) return { error: d.error.issues[0].message };
  const monthly = parseBRL(d.data.monthly);
  const yearly = parseBRL(d.data.yearly);
  if (monthly == null || monthly <= 0) return { error: "Informe o valor mensal por unidade (ex.: 2,00)." };
  if (yearly == null || yearly <= 0) return { error: "Informe o valor anual por unidade (ex.: 20,00)." };
  const data = { monthlyUnitPrice: monthly, yearlyUnitPrice: yearly, minUnits: d.data.minUnits, trialDays: d.data.trialDays, notes: d.data.notes || null, active: d.data.active === "1" };
  const old = await getDeal(condominiumId);
  await db.billingDeal.upsert({ where: { condominiumId }, create: { condominiumId, ...data }, update: data });
  await audit(me, old ? "billing_deal_updated" : "billing_deal_created", "condominium", condominiumId, {
    old: old && { monthly: old.monthlyUnitPrice, yearly: old.yearlyUnitPrice, minUnits: old.minUnits, trialDays: old.trialDays, active: old.active },
    new: { monthly, yearly, minUnits: data.minUnits, trialDays: data.trialDays, active: data.active },
    condominiumId,
  });
  // Opcional: já leva a assinatura atual para a negociação (preço novo e unidades), com proporcional
  if (data.active && d.data.apply === "1" && (await stripeConfigured())) {
    try {
      await applyDealToSubscription(condominiumId);
    } catch (e) {
      revalidateBilling();
      return { error: `Negociação salva, mas não foi possível aplicar na assinatura: ${errMessage(e)}` };
    }
  }
  revalidateBilling();
  revalidatePath(`/admin/assinaturas/${condominiumId}`);
  return { ok: true, message: d.data.apply === "1" && data.active ? "Negociação salva e aplicada na assinatura." : "Negociação salva." };
}
