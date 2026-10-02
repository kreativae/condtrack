import "server-only";
import { db } from "./db";
import { appUrl } from "./url";
import { stripe } from "./stripe";
import { ensureCustomer, syncCondominium } from "./billing";
import type { Interval } from "./billing-shared";

// Negociação especial: preço por unidade (mensal e anual) definido pelo superadmin para um
// condomínio. No Stripe, um preço por negociação e a assinatura com quantidade = unidades
// cobradas (as cadastradas, nunca menos que o mínimo combinado).

export async function getDeal(condominiumId: string) {
  return db.billingDeal.findUnique({ where: { condominiumId } });
}

/** Unidades cadastradas e unidades cobradas (respeitando o mínimo da negociação). */
export async function billableUnits(condominiumId: string, minUnits = 0) {
  const units = await db.unit.count({ where: { building: { condominiumId } } });
  return { units, billable: Math.max(units, minUnits, 1) };
}

/** Cria/atualiza produto e preços da negociação no Stripe (novo preço quando o valor muda). */
export async function ensureDealPrices(dealId: string) {
  const s = await stripe();
  const deal = await db.billingDeal.findUniqueOrThrow({ where: { id: dealId }, include: { condominium: { select: { name: true } } } });
  const name = `Condtrack — ${deal.condominium.name} (por unidade)`;
  let productId = deal.stripeProductId;
  if (!productId) {
    productId = (await s.products.create({ name, metadata: { condominiumId: deal.condominiumId, dealId: deal.id } })).id;
  } else {
    await s.products.update(productId, { name, active: true });
  }

  const ids: Record<Interval, string | null> = { month: deal.stripeMonthlyPriceId, year: deal.stripeYearlyPriceId };
  for (const interval of ["month", "year"] as Interval[]) {
    const amount = interval === "month" ? deal.monthlyUnitPrice : deal.yearlyUnitPrice;
    const current = ids[interval] ? await s.prices.retrieve(ids[interval]!).catch(() => null) : null;
    if (current && current.active && current.unit_amount === amount && current.product === productId) continue;
    const price = await s.prices.create({
      product: productId,
      currency: "brl",
      unit_amount: amount,
      recurring: { interval },
      nickname: `${deal.condominium.name} — por unidade (${interval === "month" ? "mensal" : "anual"})`,
      metadata: { condominiumId: deal.condominiumId, dealId: deal.id, interval },
    });
    if (current?.active) await s.prices.update(current.id, { active: false });
    ids[interval] = price.id;
  }
  return db.billingDeal.update({
    where: { id: dealId },
    data: { stripeProductId: productId, stripeMonthlyPriceId: ids.month, stripeYearlyPriceId: ids.year },
  });
}

/** Checkout da negociação (síndico). */
export async function createDealCheckout(condominiumId: string, interval: Interval) {
  const found = await getDeal(condominiumId);
  if (!found?.active) throw new Error("Este condomínio não tem negociação especial ativa.");
  const deal = await ensureDealPrices(found.id);
  const price = interval === "month" ? deal.stripeMonthlyPriceId! : deal.stripeYearlyPriceId!;
  const [customer, sub, { billable }] = await Promise.all([ensureCustomer(condominiumId), db.subscription.findUnique({ where: { condominiumId } }), billableUnits(condominiumId, deal.minUnits)]);
  const base = await appUrl();
  const session = await (await stripe()).checkout.sessions.create({
    mode: "subscription",
    customer,
    client_reference_id: condominiumId,
    line_items: [{ price, quantity: billable }],
    subscription_data: {
      metadata: { condominiumId, dealId: deal.id },
      ...(deal.trialDays > 0 && !sub?.hadTrial ? { trial_period_days: deal.trialDays } : {}),
    },
    locale: "pt-BR",
    success_url: `${base}/assinatura?checkout=sucesso&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/assinatura?checkout=cancelado`,
    metadata: { condominiumId },
  });
  return session.url!;
}

/**
 * Deixa a assinatura viva do condomínio no preço e na quantidade da negociação
 * (troca de ciclo, valor novo, unidades novas ou saída de um plano padrão). Com proporcional.
 * Sem assinatura viva ou sem negociação ativa, não faz nada.
 */
export async function applyDealToSubscription(condominiumId: string, interval?: Interval, opts: { onlyIfOnDeal?: boolean } = {}) {
  const found = await getDeal(condominiumId);
  const sub = await db.subscription.findUnique({ where: { condominiumId } });
  if (!found?.active || !sub?.stripeSubscriptionId || ["canceled", "incomplete_expired"].includes(sub.status)) return null;
  const deal = await ensureDealPrices(found.id);
  const target = interval ?? (sub.interval as Interval);
  const price = target === "year" ? deal.stripeYearlyPriceId! : deal.stripeMonthlyPriceId!;
  const { billable } = await billableUnits(condominiumId, deal.minUnits);
  const s = await stripe();
  const current = await s.subscriptions.retrieve(sub.stripeSubscriptionId);
  const item = current.items.data[0];
  // Ajuste automático de unidades: só mexe em quem já está na negociação (não tira ninguém de um plano)
  const product = typeof item.price.product === "string" ? item.price.product : item.price.product.id;
  if (opts.onlyIfOnDeal && product !== deal.stripeProductId) return sub;
  if (item.price.id === price && item.quantity === billable) return sub;
  await s.subscriptions.update(sub.stripeSubscriptionId, {
    items: [{ id: item.id, price, quantity: billable }],
    proration_behavior: "create_prorations",
    metadata: { condominiumId, dealId: deal.id },
  });
  return syncCondominium(condominiumId);
}

/** Depois de cadastrar/excluir unidades: ajusta a quantidade cobrada. Nunca lança. */
export async function syncDealUnits(condominiumId: string) {
  try {
    await applyDealToSubscription(condominiumId, undefined, { onlyIfOnDeal: true });
  } catch (e) {
    console.error("[billing] não foi possível ajustar as unidades da negociação", e);
  }
}
