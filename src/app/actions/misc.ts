"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";

export type FormState = { error?: string; ok?: boolean; message?: string } | undefined;

export async function openNotification(id: string) {
  const user = await requireUser();
  const n = await db.notification.findFirst({ where: { id, userId: user.id } });
  if (!n) return;
  await db.notification.update({ where: { id }, data: { read: true, readAt: new Date() } });
  redirect(n.referenceType === "service_order" && n.referenceId ? `/os/${n.referenceId}` : n.referenceType === "announcement" ? "/comunicados" : "/notificacoes");
}

export async function markAllRead() {
  const user = await requireUser();
  await db.notification.updateMany({ where: { userId: user.id, read: false }, data: { read: true, readAt: new Date() } });
  revalidatePath("/", "layout");
}

export async function changePassword(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  if (user.impersonator) return { error: "Não é possível alterar a senha em modo de visualização." };
  const current = String(form.get("current") ?? "");
  const next = String(form.get("next") ?? "");
  if (next.length < 8) return { error: "A nova senha deve ter ao menos 8 caracteres." };
  if (next !== form.get("confirm")) return { error: "As senhas não conferem." };
  if (!(await bcrypt.compare(current, user.passwordHash))) return { error: "Senha atual incorreta." };
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(next, 10) } });
  await audit(user, "change_password", "user", user.id);
  return { ok: true, message: "Senha alterada com sucesso." };
}

export async function updateProfile(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = z.object({ name: z.string().trim().min(3), phone: z.string().trim().max(30).optional() }).safeParse({ name: form.get("name"), phone: form.get("phone") || undefined });
  if (!parsed.success) return { error: "Informe um nome válido." };
  await db.user.update({ where: { id: user.id }, data: { name: parsed.data.name, phone: parsed.data.phone ?? null } });
  await audit(user, "update_profile", "user", user.id, { old: { name: user.name, phone: user.phone }, new: parsed.data });
  revalidatePath("/", "layout");
  return { ok: true, message: "Perfil atualizado." };
}

export async function createAnnouncement(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser("syndic");
  const parsed = z
    .object({
      title: z.string().trim().min(4).max(140),
      content: z.string().trim().min(10).max(5000),
      category: z.enum(["general", "maintenance", "event", "rules", "urgent"]),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Preencha título e conteúdo." };
  const a = await db.announcement.create({
    data: { ...parsed.data, priority: parsed.data.category === "urgent" ? "high" : "normal", condominiumId: user.condominiumId!, authorId: user.id },
  });
  await audit(user, "create", "announcement", a.id, { new: parsed.data });
  await notify(
    { condominiumId: user.condominiumId!, roles: ["caretaker", "council"] },
    { type: "announcement", vars: { titulo: a.title, resumo: a.content.slice(0, 140), autor: user.name }, referenceType: "announcement", referenceId: a.id },
  );
  revalidatePath("/comunicados");
  return { ok: true, message: "Comunicado publicado." };
}

export async function confirmRead(id: string) {
  const user = await requireUser();
  const a = await db.announcement.findFirst({ where: { id, condominiumId: user.condominiumId ?? "" } });
  if (!a) return;
  const readBy: string[] = JSON.parse(a.readBy);
  if (!readBy.includes(user.id)) {
    await db.announcement.update({ where: { id }, data: { readBy: JSON.stringify([...readBy, user.id]) } });
  }
  revalidatePath("/comunicados");
}
