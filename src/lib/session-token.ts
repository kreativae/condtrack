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
  if (!s) throw new Error("AUTH_SECRET não configurado");
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
    const { payload } = await jwtVerify<SessionPayload>(token, secret());
    return payload;
  } catch {
    return null;
  }
}
