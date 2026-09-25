import "server-only";
import { db } from "./db";
import { appUrl } from "./url";

export { appUrl };
import { stripe, type Stripe } from "./stripe";
import { notify } from "./notify";
import { TRIAL_DAYS, type Interval } from "./billing-shared";

const lookupKey = (planKey: string, interval: Interval) => `condtrack_${planKey}_${interval}`;

// ───────────────────────────── Produtos e preços ─────────────────────────────

/**
 * Garante Produto + Prices (mensal/anual, BRL) no Stripe para o plano.
 * Prices são imutáveis: se o valor mudou, cria um novo Price e transfere a
 * lookup_key; o antigo é arquivado (assinaturas existentes continuam nele).
 */
export async function ensureStripePrices(planId: string) {
  const s = await stripe();
  let plan = await db.plan.findUniqueOrThrow({ where: { id: planId } });

  let productId = plan.stripeProductId;
  if (!productId) {
    // Reaproveita o produto de um preço já existente (ex.: banco recriado)
    const prev = (await s.prices.list({ lookup_keys: [lookupKey(plan.key, "month")], limit: 1 })).data[0];
    if (prev) productId = typeof prev.product === "string" ? prev.product : prev.product.id;
  }
  if (!productId) {
    const product = await s.products.create({
      name: `Condtrack ${plan.name}`,
      description: plan.description ?? undefined,
      metadata: { planKey: plan.key },
    });
    productId = product.id;
  } else {
    await s.products.update(productId, { name: `Condtrack ${plan.name}`, description: plan.description ?? undefined, active: plan.active });
  }

  const ids: Record<Interval, string> = { month: "", year: "" };
  for (const interval of ["month", "year"] as Interval[]) {
    const amount = interval === "month" ? plan.monthlyPrice : plan.yearlyPrice;
    const key = lookupKey(plan.key, interval);
    const existing = (await s.prices.list({ lookup_keys: [key], active: true, limit: 1 })).data[0];
    if (existing && existing.unit_amount === amount && existing.product === productId) {
      ids[interval] = existing.id;
      continue;
    }
    const price = await s.prices.create({
      product: productId,
      currency: "brl",
      unit_amount: amount,
      recurring: { interval },
      lookup_key: key,
      transfer_lookup_key: true,
      nickname: `${plan.name} ${interval === "month" ? "mensal" : "anual"}`,
      metadata: { planKey: plan.key, interval },
    });
    if (existing) await s.prices.update(existing.id, { active: false });
    ids[interval] = price.id;
  }

  plan = await db.plan.update({
    where: { id: plan.id },
    data: { stripeProductId: productId, stripeMonthlyPriceId: ids.month, stripeYearlyPriceId: ids.year },
  });
  return plan;
}

async function planFromPrice(priceId: string | undefined) {
  if (!priceId) return null;
  return db.plan.findFirst({ where: { OR: [{ stripeMonthlyPriceId: priceId }, { stripeYearlyPriceId: priceId }] } });
}

// ───────────────────────────── Cliente ─────────────────────────────

export async function ensureCustomer(condominiumId: string) {
  const condo = await db.condominium.findUniqueOrThrow({ where: { id: condominiumId }, include: { subscription: true } });
  if (condo.subscription?.stripeCustomerId) return condo.subscription.stripeCustomerId;

  const syndic = await db.user.findFirst({ where: { condominiumId, role: "syndic", status: "active" } });
  const customer = await (await stripe()).customers.create({
    name: condo.name,
    email: condo.email ?? syndic?.email ?? undefined,
    phone: condo.phone ?? undefined,
    preferred_locales: ["pt-BR"],
    metadata: { condominiumId, cnpj: condo.cnpj ?? "" },
  });
  await db.subscription.upsert({
    where: { condominiumId },
    create: { condominiumId, stripeCustomerId: customer.id, status: "incomplete" },
    update: { stripeCustomerId: customer.id },
  });
  return customer.id;
}

// ───────────────────────────── Checkout / Portal ─────────────────────────────

export async function createCheckout(condominiumId: string, planId: string, interval: Interval) {
  const plan = await ensureStripePrices(planId);
  const price = interval === "month" ? plan.stripeMonthlyPriceId! : plan.stripeYearlyPriceId!;
  const customer = await ensureCustomer(condominiumId);
  const sub = await db.subscription.findUnique({ where: { condominiumId } });
  const base = await appUrl();

  const session = await (await stripe()).checkout.sessions.create({
    mode: "subscription",
    customer,
    client_reference_id: condominiumId,
    line_items: [{ price, quantity: 1 }],
    subscription_data: {
      metadata: { condominiumId, planKey: plan.key },
      ...(sub?.hadTrial ? {} : { trial_period_days: TRIAL_DAYS }),
    },
    allow_promotion_codes: true,
    locale: "pt-BR",
    success_url: `${base}/assinatura?checkout=sucesso&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/assinatura?checkout=cancelado`,
    metadata: { condominiumId },
  });
  return session.url!;
}

async function portalConfiguration() {
  const s = await stripe();
  const existing = (await s.billingPortal.configurations.list({ active: true, limit: 10 })).data.find((c) => c.metadata?.app === "condtrack");
  if (existing) return existing.id;
  const cfg = await s.billingPortal.configurations.create({
    business_profile: { headline: "Condtrack — gestão da assinatura do condomínio" },
    features: {
      payment_method_update: { enabled: true },
      invoice_history: { enabled: true },
      customer_update: { enabled: true, allowed_updates: ["email", "address", "tax_id", "name"] },
    },
    metadata: { app: "condtrack" },
  });
  return cfg.id;
}

export async function createPortal(condominiumId: string) {
  const customer = await ensureCustomer(condominiumId);
  const session = await (await stripe()).billingPortal.sessions.create({
    customer,
    configuration: await portalConfiguration(),
    locale: "pt-BR",
    return_url: `${await appUrl()}/assinatura`,
  });
  return session.url;
}

// ───────────────────────────── Alterações ─────────────────────────────

export async function changePlan(condominiumId: string, planId: string, interval: Interval) {
  const sub = await db.subscription.findUnique({ where: { condominiumId } });
  if (!sub?.stripeSubscriptionId) throw new Error("Sem assinatura ativa.");
  const plan = await ensureStripePrices(planId);
  const price = interval === "month" ? plan.stripeMonthlyPriceId! : plan.stripeYearlyPriceId!;
  const s = await stripe();
  const current = await s.subscriptions.retrieve(sub.stripeSubscriptionId);
  await s.subscriptions.update(sub.stripeSubscriptionId, {
    items: [{ id: current.items.data[0].id, price }],
    proration_behavior: "create_prorations",
    cancel_at_period_end: false,
    metadata: { condominiumId, planKey: plan.key },
  });
  return syncCondominium(condominiumId);
}

export async function setCancelAtPeriodEnd(condominiumId: string, cancel: boolean) {
  const sub = await db.subscription.findUnique({ where: { condominiumId } });
  if (!sub?.stripeSubscriptionId) throw new Error("Sem assinatura ativa.");
  await (await stripe()).subscriptions.update(sub.stripeSubscriptionId, { cancel_at_period_end: cancel });
  return syncCondominium(condominiumId);
}

// ───────────────────────────── Sincronização ─────────────────────────────

const ts = (n: number | null | undefined) => (n ? new Date(n * 1000) : null);

/** Grava o estado de uma assinatura Stripe no banco. */
export async function upsertFromStripeSubscription(s: Stripe.Subscription) {
  const condominiumId =
    s.metadata?.condominiumId ??
    (await db.subscription.findFirst({ where: { stripeCustomerId: typeof s.customer === "string" ? s.customer : s.customer.id } }))?.condominiumId;
  if (!condominiumId) return null;

  const item = s.items.data[0];
  const plan = await planFromPrice(item?.price.id);
  let pm: Stripe.PaymentMethod | null = null;
  if (s.default_payment_method) {
    pm = typeof s.default_payment_method === "string" ? await (await stripe()).paymentMethods.retrieve(s.default_payment_method) : s.default_payment_method;
  }
  const data = {
    planId: plan?.id ?? null,
    interval: item?.price.recurring?.interval ?? "month",
    status: s.status,
    stripeCustomerId: typeof s.customer === "string" ? s.customer : s.customer.id,
    stripeSubscriptionId: s.id,
    unitAmount: item?.price.unit_amount ?? null,
    currentPeriodStart: ts(item?.current_period_start),
    currentPeriodEnd: ts(item?.current_period_end),
    trialEnd: ts(s.trial_end),
    cancelAtPeriodEnd: s.cancel_at_period_end || !!s.cancel_at,
    canceledAt: ts(s.canceled_at),
    paymentMethodBrand: pm?.card?.brand ?? pm?.type ?? null,
    paymentMethodLast4: pm?.card?.last4 ?? null,
    hadTrial: true,
    syncedAt: new Date(),
  };
  const prev = await db.subscription.findUnique({ where: { condominiumId } });
  // Não sobrescrever uma assinatura mais recente com eventos de uma antiga/cancelada
  if (prev?.stripeSubscriptionId && prev.stripeSubscriptionId !== s.id && s.status === "canceled" && prev.status !== "canceled") return prev;
  return db.subscription.upsert({ where: { condominiumId }, create: { condominiumId, ...data }, update: data });
}

export async function upsertFromStripeInvoice(inv: Stripe.Invoice) {
  const customerId = typeof inv.customer === "string" ? inv.customer : inv.customer?.id;
  const sub = customerId ? await db.subscription.findFirst({ where: { stripeCustomerId: customerId } }) : null;
  const condominiumId = sub?.condominiumId ?? inv.parent?.subscription_details?.metadata?.condominiumId;
  if (!condominiumId || !inv.id) return null;
  const line = inv.lines?.data[0];
  const data = {
    condominiumId,
    number: inv.number,
    status: inv.status ?? "draft",
    amountDue: inv.amount_due,
    amountPaid: inv.amount_paid,
    currency: inv.currency,
    description: line?.description ?? null,
    periodStart: ts(line?.period?.start),
    periodEnd: ts(line?.period?.end),
    paidAt: ts(inv.status_transitions?.paid_at),
    dueDate: ts(inv.due_date),
    attemptCount: inv.attempt_count ?? 0,
    hostedInvoiceUrl: inv.hosted_invoice_url ?? null,
    invoicePdf: inv.invoice_pdf ?? null,
    createdAt: ts(inv.created) ?? new Date(),
  };
  return db.payment.upsert({ where: { stripeInvoiceId: inv.id }, create: { stripeInvoiceId: inv.id, ...data }, update: data });
}

/** Sincroniza assinatura + faturas de um condomínio direto da API (não depende de webhook). */
export async function syncCondominium(condominiumId: string) {
  const sub = await db.subscription.findUnique({ where: { condominiumId } });
  if (!sub?.stripeCustomerId) return sub;
  const s = await stripe();
  const subs = await s.subscriptions.list({ customer: sub.stripeCustomerId, status: "all", limit: 10, expand: ["data.default_payment_method"] });
  // Preferir a assinatura "viva" mais recente
  const pick = subs.data.find((x) => !["canceled", "incomplete_expired"].includes(x.status)) ?? subs.data[0];
  if (pick) await upsertFromStripeSubscription(pick);
  const invoices = await s.invoices.list({ customer: sub.stripeCustomerId, limit: 24 });
  for (const inv of invoices.data) if (inv.status !== "draft") await upsertFromStripeInvoice(inv);
  return db.subscription.findUnique({ where: { condominiumId } });
}

/** Avisa síndico e superadmins sobre falha de pagamento. */
export async function notifyPaymentFailed(condominiumId: string, amount: number) {
  const admins = await db.user.findMany({ where: { role: "superadmin", status: "active" }, select: { id: true } });
  const condo = await db.condominium.findUnique({ where: { id: condominiumId }, select: { name: true } });
  await notify(
    { condominiumId, roles: ["syndic"], userIds: admins.map((a) => a.id) },
    {
      type: "billing_payment_failed",
      vars: { condominio: condo?.name, valor: new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(amount / 100) },
      referenceType: "billing",
    },
  );
}
