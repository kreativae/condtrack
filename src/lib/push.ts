import "server-only";
import webpush from "web-push";
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
