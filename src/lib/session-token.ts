// Assinatura/verificação do JWT de sessão. Sem dependências de Node — usado
// tanto no proxy quanto no servidor.
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "condtrack_session";
/** Padrão; o valor efetivo vem de Configurações → Segurança. */
export const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12h

export type SessionPayload = {
  uid: string;
  /** Quando um superadmin está "visualizando como" outro usuário. */
  actor?: string;
};

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET não configurado — defina a variável de ambiente (ex.: openssl rand -base64 32)");
  return new TextEncoder().encode(s);
}

export async function signSession(payload: SessionPayload, ttlSeconds = SESSION_TTL_SECONDS) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(secret());
}

export async function verifySession(token: string | undefined) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify<SessionPayload & { p?: string }>(token, secret());
    // Tokens com finalidade própria (ex.: login aguardando o código das duas etapas) nunca valem como sessão
    if (payload.p) return null;
    return payload;
  } catch {
    return null;
  }
}

// ───── Login aguardando o código das duas etapas (senha já conferida)

export const PENDING_2FA_COOKIE = "condtrack_2fa";
export const PENDING_2FA_TTL_SECONDS = 5 * 60;

export async function signPending2fa(uid: string, next: string) {
  return new SignJWT({ uid, next, p: "2fa" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${PENDING_2FA_TTL_SECONDS}s`)
    .sign(secret());
}

export async function verifyPending2fa(token: string | undefined) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify<{ uid: string; next: string; p: string }>(token, secret());
    return payload.p === "2fa" && payload.uid ? { uid: payload.uid, next: payload.next ?? "" } : null;
  } catch {
    return null;
  }
}
