import "server-only";
import Stripe from "stripe";
import { getSettings } from "./settings";

// Chaves vêm de Configurações (superadmin), com fallback nas variáveis de ambiente.
let client: Stripe | null = null;
let clientKey: string | null = null;

async function secretKey() {
  return String((await getSettings("stripe")).secretKey ?? "") || null;
}

export async function stripeConfigured() {
  return !!(await secretKey());
}

export async function stripeWebhookSecret() {
  return String((await getSettings("stripe")).webhookSecret ?? "") || null;
}

/** Cliente Stripe; recriado se a chave for alterada nas configurações. */
export async function stripe() {
  const key = await secretKey();
  if (!key) throw new Error("STRIPE_SECRET_KEY não configurada");
  if (!client || clientKey !== key) {
    client = new Stripe(key, { appInfo: { name: "Condtrack" } });
    clientKey = key;
  }
  return client;
}

/** Cliente avulso para testar uma chave antes de salvar. */
export function stripeWithKey(key: string) {
  return new Stripe(key, { appInfo: { name: "Condtrack" } });
}

export async function stripeDashboardUrl(path: string) {
  const test = (await secretKey())?.includes("_test_") ? "/test" : "";
  return `https://dashboard.stripe.com${test}/${path}`;
}

export type { Stripe };
