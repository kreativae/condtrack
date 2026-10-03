import "server-only";
import webpush from "web-push";
import { z } from "zod";
import { db } from "./db";

// Notificações no celular/computador (Web Push, padrão dos navegadores).
// Precisa das chaves VAPID nas variáveis de ambiente (gere com: npx web-push generate-vapid-keys):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY e, opcional, VAPID_SUBJECT (mailto: ou https: de contato).

export function pushPublicKey() {
  return process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null;
}
export const pushEnabled = () => !!(pushPublicKey() && process.env.VAPID_PRIVATE_KEY);

export type PushPayload = { title: string; body: string; url: string; tag?: string };

/**
 * Envia para todos os aparelhos das pessoas. `subject`: endereço do site (https), exigido pelos
 * serviços de push para identificar quem envia. Inscrições revogadas (404/410) são apagadas.
 */
export async function sendPush(userIds: string[], payload: PushPayload, subject: string) {
  const publicKey = pushPublicKey();
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey || !userIds.length) return { sent: 0, failed: 0 };
  const devices = await db.pushDevice.findMany({ where: { userId: { in: userIds } } });
  if (!devices.length) return { sent: 0, failed: 0 };

  const vapidDetails = { subject: process.env.VAPID_SUBJECT || subject, publicKey, privateKey };
  const body = JSON.stringify(payload);
  const gone: string[] = [];
  const ok: string[] = [];
  let failed = 0;
  await Promise.all(
    devices.map(async (d) => {
      try {
        await webpush.sendNotification({ endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } }, body, { vapidDetails, TTL: 24 * 3600, urgency: "normal" });
        ok.push(d.id);
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) gone.push(d.id);
        else {
          failed++;
          console.error(`[push] falha (${status ?? "?"}) no aparelho ${d.id}`);
        }
      }
    }),
  );
  if (gone.length) await db.pushDevice.deleteMany({ where: { id: { in: gone } } });
  if (ok.length) await db.pushDevice.updateMany({ where: { id: { in: ok } }, data: { lastUsedAt: new Date() } });
  return { sent: ok.length, failed };
}

// Só os serviços de push dos navegadores (o servidor faz requisições para esse endereço: evita SSRF)
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /(^|\.)push\.apple\.com$/, /^updates\.push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/];
export const pushHost = (u: string) => {
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

/**
 * Grava (ou atualiza as chaves de) um aparelho inscrito. Chaves velhas fazem o navegador descartar a
 * notificação sem aviso, por isso a inscrição é reenviada sempre que muda ou que Meu perfil abre.
 */
export async function savePushDevice(userId: string, sub: unknown, name: string | null) {
  const parsed = subSchema.safeParse(sub);
  if (!parsed.success) return { ok: false as const, error: "Inscrição inválida." };
  const { endpoint, keys } = parsed.data;
  const data = { userId, p256dh: keys.p256dh, auth: keys.auth, ...(name ? { name: name.slice(0, 60) } : {}) };
  // O mesmo navegador pode ter sido de outra conta antes: a inscrição passa para quem está logado
  await db.pushDevice.upsert({ where: { endpoint }, create: { endpoint, name: "", ...data }, update: data });
  return { ok: true as const, endpoint };
}
