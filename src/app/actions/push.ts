"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { appUrl } from "@/lib/url";
import { pushEnabled, sendPush } from "@/lib/push";

// Só os serviços de push dos navegadores (o servidor faz requisições para esse endereço)
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /(^|\.)push\.apple\.com$/, /^updates\.push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/];
const pushHost = (u: string) => {
  try {
    const url = new URL(u);
    return url.protocol === "https:" && !url.port && PUSH_HOSTS.some((h) => h.test(url.hostname));
  } catch {
    return false;
  }
};

const subSchema = z.object({
  endpoint: z.string().max(1000).refine(pushHost, "Serviço de notificação não reconhecido."),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
});

/** Inscreve este aparelho (a inscrição vem do navegador, depois de a pessoa permitir as notificações). */
export async function subscribePush(sub: unknown, name: string) {
  const user = await requireUser();
  if (user.impersonator) return { ok: false, error: "Indisponível em modo de visualização." };
  if (!pushEnabled()) return { ok: false, error: "As notificações no celular ainda não foram configuradas." };
  const parsed = subSchema.safeParse(sub);
  if (!parsed.success) return { ok: false, error: "Inscrição inválida." };
  const { endpoint, keys } = parsed.data;
  const device = { userId: user.id, p256dh: keys.p256dh, auth: keys.auth, name: name.slice(0, 60) };
  // O mesmo navegador pode ter sido de outra conta antes: a inscrição passa para quem está logado
  await db.pushDevice.upsert({ where: { endpoint }, create: { endpoint, ...device }, update: device });
  await audit(user, "push_subscribe", "user", user.id, { new: { aparelho: device.name } });
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
