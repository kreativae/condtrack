import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { stripe, stripeWebhookSecret, type Stripe } from "@/lib/stripe";
import { notifyPaymentFailed, upsertFromStripeInvoice, upsertFromStripeSubscription } from "@/lib/billing";

// Webhook do Stripe. Configure o endpoint /api/stripe/webhook no Stripe com os
// eventos abaixo e informe o segredo em Configurações → Stripe.
export async function POST(req: Request) {
  const secret = await stripeWebhookSecret();
  const signature = req.headers.get("stripe-signature");
  if (!secret || !signature) return NextResponse.json({ error: "webhook não configurado" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = await (await stripe()).webhooks.constructEventAsync(await req.text(), signature, secret);
  } catch {
    return NextResponse.json({ error: "assinatura inválida" }, { status: 400 });
  }

  // Idempotência: o Stripe pode reenviar o mesmo evento
  if (await db.stripeEvent.findUnique({ where: { id: event.id } })) return NextResponse.json({ received: true, duplicate: true });

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      if (session.subscription) {
        const sub = await (await stripe()).subscriptions.retrieve(typeof session.subscription === "string" ? session.subscription : session.subscription.id, { expand: ["default_payment_method"] });
        await upsertFromStripeSubscription(sub);
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "customer.subscription.trial_will_end": {
      const sub = await (await stripe()).subscriptions.retrieve(event.data.object.id, { expand: ["default_payment_method"] });
      await upsertFromStripeSubscription(sub);
      break;
    }
    case "invoice.finalized":
    case "invoice.paid":
    case "invoice.voided":
    case "invoice.marked_uncollectible":
      await upsertFromStripeInvoice(event.data.object);
      break;
    case "invoice.payment_failed": {
      const payment = await upsertFromStripeInvoice(event.data.object);
      if (payment) await notifyPaymentFailed(payment.condominiumId, payment.amountDue);
      break;
    }
  }

  await db.stripeEvent.create({ data: { id: event.id, type: event.type } });
  return NextResponse.json({ received: true });
}
