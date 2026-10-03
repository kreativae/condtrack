"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { appUrl } from "@/lib/url";
import { pushEnabled, savePushDevice, sendPush } from "@/lib/push";

/**
 * Inscreve este aparelho (a inscrição vem do navegador, depois de a pessoa permitir as notificações).
 * `silent`: sincronização ao abrir Meu perfil (atualiza as chaves, sem auditoria nem recarregar a página).
 */
export async function subscribePush(sub: unknown, name: string, silent = false) {
  const user = await requireUser();
  if (user.impersonator) return { ok: false, error: "Indisponível em modo de visualização." };
  if (!pushEnabled()) return { ok: false, error: "As notificações no celular ainda não foram configuradas." };
  const r = await savePushDevice(user.id, sub, name);
  if (!r.ok) return { ok: false, error: r.error };
  if (silent) return { ok: true };
  await audit(user, "push_subscribe", "user", user.id, { new: { aparelho: name.slice(0, 60) } });
  revalidatePath("/perfil");
  return { ok: true };
}

/** Remove um aparelho da pessoa (pelo id, na lista) ou este navegador (pelo endereço da inscrição). */
export async function unsubscribePush(by: { id?: string; endpoint?: string }) {
  const user = await requireUser();
  if (user.impersonator) return { ok: false };
  await db.pushDevice.deleteMany({ where: { userId: user.id, ...(by.id ? { id: by.id } : { endpoint: by.endpoint ?? "" }) } });
  revalidatePath("/perfil");
  return { ok: true };
}

/** Envia uma notificação de teste para todos os aparelhos da pessoa. */
export async function testPush() {
  const user = await requireUser();
  if (user.impersonator) return { ok: false, error: "Indisponível em modo de visualização." };
  const r = await sendPush([user.id], { title: "Condtrack", body: "Tudo certo! As notificações chegam neste aparelho.", url: "/perfil", tag: "teste" }, await appUrl());
  if (!r.sent) return { ok: false, error: r.failed ? "Não foi possível enviar. Tente remover e ativar de novo." : "Nenhum aparelho ativo." };
  return { ok: true, sent: r.sent };
}
