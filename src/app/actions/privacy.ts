"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { termsVersion } from "@/lib/legal";

// LGPD: aceite dos termos e pedidos do titular (exclusão da conta).

export async function acceptTerms(form: FormData) {
  const user = await requireUser();
  if (user.impersonator) redirect("/dashboard");
  if (form.get("agree") !== "on") redirect("/aceite?faltou=1");
  const version = await termsVersion();
  if (!version) redirect("/dashboard");
  await db.user.update({ where: { id: user.id }, data: { termsAcceptedAt: new Date(), termsVersion: version } });
  await audit(user, "terms_accept", "user", user.id, { new: { versao: version } });
  redirect("/dashboard");
}

export type PrivacyState = { error?: string; ok?: boolean; message?: string } | undefined;

/** A pessoa pede a exclusão da conta; os superadmins são avisados e concluem em Editar usuário. */
export async function requestAccountDeletion(_: PrivacyState, form: FormData): Promise<PrivacyState> {
  const user = await requireUser();
  if (user.impersonator) return { error: "Indisponível em modo de visualização." };
  if (user.role === "superadmin") return { error: "A conta de superadmin é excluída por outro superadmin, em Usuários." };
  if (user.deletionRequestedAt) return { error: "Seu pedido já foi registrado." };
  const reason = String(form.get("reason") ?? "").trim().slice(0, 500);
  await db.user.update({ where: { id: user.id }, data: { deletionRequestedAt: new Date() } });
  await audit(user, "privacy_deletion_request", "user", user.id, { new: { motivo: reason || null } });
  const admins = await db.user.findMany({ where: { role: "superadmin", status: "active" }, select: { id: true } });
  if (admins.length) {
    await db.notification.createMany({
      data: admins.map((a) => ({
        userId: a.id, type: "privacy_deletion_request", title: "Pedido de exclusão de conta (LGPD)",
        message: `${user.name} (${user.email}) pediu a exclusão da conta.${reason ? `\n“${reason}”` : ""}`,
        referenceType: "user", referenceId: user.id,
      })),
    });
  }
  revalidatePath("/perfil");
  return { ok: true, message: "Pedido registrado. A administração vai concluir a exclusão e avisar você." };
}

/** Desiste do pedido de exclusão. */
export async function cancelAccountDeletion() {
  const user = await requireUser();
  if (user.impersonator || !user.deletionRequestedAt) return;
  await db.user.update({ where: { id: user.id }, data: { deletionRequestedAt: null } });
  await audit(user, "privacy_deletion_cancel", "user", user.id);
  revalidatePath("/perfil");
}
