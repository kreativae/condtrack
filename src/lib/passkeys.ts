import "server-only";
import { cookies, headers } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { getSettings } from "./settings";

const CHALLENGE_COOKIE = "condtrack_webauthn";

/** Parâmetros WebAuthn: RP ID/origens das configurações ou do host atual. */
export async function passkeyConfig() {
  const s = await getSettings("passkeys");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const currentOrigin = `${proto}://${host}`;
  const rpID = String(s.rpId || "").trim() || host.split(":")[0];
  const origins = String(s.allowedOrigins || "")
    .split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean);
  return {
    enabled: s.enabled !== false,
    rpName: String(s.rpName || "Condtrack"),
    rpID,
    origins: origins.length ? origins : [currentOrigin],
  };
}

function secret() {
  if (!process.env.AUTH_SECRET) throw new Error("AUTH_SECRET não configurado");
  return new TextEncoder().encode(`webauthn:${process.env.AUTH_SECRET}`);
}

/** Guarda o desafio num cookie assinado de curta duração (5 min). */
export async function storeChallenge(challenge: string, purpose: "register" | "login", userId?: string) {
  const token = await new SignJWT({ challenge, purpose, userId }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("5m").sign(secret());
  (await cookies()).set(CHALLENGE_COOKIE, token, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 300 });
}

export async function takeChallenge(purpose: "register" | "login") {
  const jar = await cookies();
  const token = jar.get(CHALLENGE_COOKIE)?.value;
  jar.delete(CHALLENGE_COOKIE);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify<{ challenge: string; purpose: string; userId?: string }>(token, secret());
    return payload.purpose === purpose ? payload : null;
  } catch {
    return null;
  }
}

/** Nome amigável do aparelho a partir do user-agent. */
export async function guessDeviceName() {
  const ua = (await headers()).get("user-agent") ?? "";
  if (/iPhone/.test(ua)) return "iPhone (Face ID)";
  if (/iPad/.test(ua)) return "iPad";
  if (/Macintosh/.test(ua)) return "Mac (Touch ID)";
  if (/Android/.test(ua)) return "Android";
  if (/Windows/.test(ua)) return "Windows Hello";
  return "Aparelho";
}
