import "server-only";
import { headers } from "next/headers";
import { getSettings } from "./settings";

/** Configuração pública do Turnstile para o formulário de login (null = desativado). */
export async function turnstileSiteKey() {
  const s = await getSettings("security");
  return s.turnstileEnabled && s.turnstileSiteKey && s.turnstileSecretKey ? String(s.turnstileSiteKey) : null;
}

/** Valida o token do Cloudflare Turnstile. Sempre true quando desativado. */
export async function verifyTurnstile(token: string, secretOverride?: string) {
  const s = await getSettings("security");
  const secret = secretOverride ?? (s.turnstileEnabled ? String(s.turnstileSecretKey ?? "") : "");
  if (!secret) return true;
  if (!token) return false;
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim();
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: new URLSearchParams({ secret, response: token, ...(ip ? { remoteip: ip } : {}) }),
    });
    const data = (await res.json()) as { success: boolean };
    return data.success;
  } catch {
    return false;
  }
}
