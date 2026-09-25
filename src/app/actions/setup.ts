"use server";

import bcrypt from "bcryptjs";
import { createHash, timingSafeEqual } from "node:crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { setSessionCookie } from "@/lib/auth";
import { ensureDefaultPlans } from "@/lib/default-plans";
import { setupAvailable, setupTokenConfigured } from "@/lib/setup";

export type SetupState = { error?: string } | undefined;

const schema = z
  .object({
    token: z.string().min(1, "Informe o código de instalação."),
    name: z.string().trim().min(3, "Informe seu nome completo."),
    email: z.string().trim().toLowerCase().email("E-mail inválido."),
    password: z.string().min(10, "A senha precisa ter ao menos 10 caracteres."),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, { message: "As senhas não conferem.", path: ["confirm"] });

/** Compara em tempo constante (não vaza o tamanho nem o conteúdo do código). */
function sameToken(given: string, expected: string) {
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function createFirstAdmin(_prev: SetupState, form: FormData): Promise<SetupState> {
  if (!(await setupAvailable())) return { error: "O primeiro acesso já foi concluído. Entre pela tela de login." };
  if (!setupTokenConfigured()) return { error: "Defina a variável SETUP_TOKEN (mínimo 12 caracteres) e faça um novo deploy." };

  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  if (!sameToken(d.token.trim(), process.env.SETUP_TOKEN!)) {
    await audit(null, "setup_failed", "user", null, { new: { email: d.email } });
    await new Promise((r) => setTimeout(r, 1500)); // freia tentativas em série
    return { error: "Código de instalação incorreto." };
  }

  const passwordHash = await bcrypt.hash(d.password, 10);
  let userId: string;
  try {
    userId = await db.$transaction(async (tx) => {
      // Rechecagem dentro da transação: evita dois cadastros simultâneos
      if ((await tx.user.count({ where: { role: "superadmin" } })) > 0) throw new Error("already");
      if (await tx.user.findUnique({ where: { email: d.email } })) throw new Error("email");
      const u = await tx.user.create({ data: { name: d.name, email: d.email, role: "superadmin", status: "active", passwordHash, lastLoginAt: new Date() } });
      await ensureDefaultPlans(tx);
      return u.id;
    });
  } catch (e) {
    const code = e instanceof Error ? e.message : "";
    if (code === "already") return { error: "O primeiro acesso já foi concluído. Entre pela tela de login." };
    if (code === "email") return { error: "Já existe um usuário com este e-mail." };
    throw e;
  }

  await setSessionCookie({ uid: userId });
  await audit({ id: userId, condominiumId: null, impersonator: null }, "setup_completed", "user", userId, { new: { name: d.name, email: d.email } });
  redirect("/dashboard?bem-vindo=1");
}
