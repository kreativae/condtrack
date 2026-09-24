"use server";

import { revalidatePath } from "next/cache";
import {
  generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireUser, setSessionCookie } from "@/lib/auth";
import { guessDeviceName, passkeyConfig, storeChallenge, takeChallenge } from "@/lib/passkeys";

type Result<T = unknown> = { ok: true; data?: T } | { ok: false; error: string };

// ───────────────────────────── Cadastro (usuário logado) ─────────────────────────────

export async function passkeyRegistrationOptions(): Promise<Result> {
  const user = await requireUser();
  if (user.impersonator) return { ok: false, error: "Não é possível cadastrar biometria em modo de visualização." };
  const cfg = await passkeyConfig();
  if (!cfg.enabled) return { ok: false, error: "Login com biometria está desativado." };
  const existing = await db.passkey.findMany({ where: { userId: user.id } });
  const options = await generateRegistrationOptions({
    rpName: cfg.rpName,
    rpID: cfg.rpID,
    userName: user.email,
    userDisplayName: user.name,
    userID: new TextEncoder().encode(user.id),
    attestationType: "none",
    excludeCredentials: existing.map((p) => ({ id: p.id, transports: JSON.parse(p.transports) })),
    // Credencial descoberta (login sem digitar e-mail) + verificação biométrica obrigatória
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
  });
  await storeChallenge(options.challenge, "register", user.id);
  return { ok: true, data: options };
}

export async function verifyPasskeyRegistration(response: RegistrationResponseJSON): Promise<Result> {
  const user = await requireUser();
  const challenge = await takeChallenge("register");
  if (!challenge || challenge.userId !== user.id) return { ok: false, error: "O cadastro expirou. Tente novamente." };
  const cfg = await passkeyConfig();
  try {
    const { verified, registrationInfo } = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: cfg.origins,
      expectedRPID: cfg.rpID,
      requireUserVerification: true,
    });
    if (!verified || !registrationInfo) return { ok: false, error: "Não foi possível verificar o aparelho." };
    const { credential, credentialDeviceType, credentialBackedUp } = registrationInfo;
    await db.passkey.create({
      data: {
        id: credential.id,
        userId: user.id,
        publicKey: Buffer.from(credential.publicKey),
        counter: credential.counter,
        transports: JSON.stringify(credential.transports ?? []),
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
        name: await guessDeviceName(),
      },
    });
    await audit(user, "passkey_registered", "passkey", credential.id);
    revalidatePath("/perfil");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Falha no cadastro." };
  }
}

export async function deletePasskey(id: string) {
  const user = await requireUser();
  const p = await db.passkey.findFirst({ where: { id, userId: user.id } });
  if (!p) return;
  await db.passkey.delete({ where: { id } });
  await audit(user, "passkey_removed", "passkey", id);
  revalidatePath("/perfil");
}

export async function renamePasskey(id: string, name: string) {
  const user = await requireUser();
  await db.passkey.updateMany({ where: { id, userId: user.id }, data: { name: name.trim().slice(0, 60) || "Aparelho" } });
  revalidatePath("/perfil");
}

// ───────────────────────────── Login (público) ─────────────────────────────

export async function passkeyLoginOptions(): Promise<Result> {
  const cfg = await passkeyConfig();
  if (!cfg.enabled) return { ok: false, error: "Login com biometria está desativado." };
  const options = await generateAuthenticationOptions({ rpID: cfg.rpID, userVerification: "required" });
  await storeChallenge(options.challenge, "login");
  return { ok: true, data: options };
}

export async function verifyPasskeyLogin(response: AuthenticationResponseJSON, next?: string): Promise<Result<{ redirect: string }>> {
  const challenge = await takeChallenge("login");
  if (!challenge) return { ok: false, error: "A tentativa expirou. Tente novamente." };
  const cfg = await passkeyConfig();
  if (!cfg.enabled) return { ok: false, error: "Login com biometria está desativado." };

  const passkey = await db.passkey.findUnique({ where: { id: response.id }, include: { user: true } });
  if (!passkey) return { ok: false, error: "Este aparelho não está cadastrado. Entre com e-mail e senha e cadastre a biometria no seu perfil." };
  const user = passkey.user;
  if (user.status !== "active") return { ok: false, error: "Seu acesso está desativado. Fale com a administração." };
  if (user.lockedUntil && user.lockedUntil > new Date()) return { ok: false, error: "Acesso temporariamente bloqueado por excesso de tentativas." };

  try {
    const { verified, authenticationInfo } = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: cfg.origins,
      expectedRPID: cfg.rpID,
      requireUserVerification: true,
      credential: { id: passkey.id, publicKey: new Uint8Array(passkey.publicKey), counter: passkey.counter, transports: JSON.parse(passkey.transports) },
    });
    if (!verified) return { ok: false, error: "Não foi possível verificar a biometria." };
    await db.passkey.update({ where: { id: passkey.id }, data: { counter: authenticationInfo.newCounter, lastUsedAt: new Date() } });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Falha na verificação." };
  }

  await db.user.update({ where: { id: user.id }, data: { failedLogins: 0, lastLoginAt: new Date() } });
  await setSessionCookie({ uid: user.id });
  await audit({ id: user.id, condominiumId: user.condominiumId, impersonator: null }, "login_passkey", "user", user.id);
  return { ok: true, data: { redirect: next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard" } };
}
