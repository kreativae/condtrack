import { describe, expect, it } from "vitest";
import { pushHost } from "@/lib/push";

// O servidor faz requisições para o endereço da inscrição: só os serviços de push oficiais (anti-SSRF)
describe("endereços de inscrição de notificações", () => {
  it.each([
    "https://fcm.googleapis.com/fcm/send/abc", "https://web.push.apple.com/QGx", "https://updates.push.services.mozilla.com/wpush/v2/x", "https://wns2-bl2p.notify.windows.com/w/?token=x",
  ])("aceita %s", (u) => expect(pushHost(u)).toBe(true));
  it.each([
    "http://fcm.googleapis.com/x", "https://169.254.169.254/latest", "https://fcm.googleapis.com.evil.com/x", "https://evilpush.apple.com.attacker.io/", "https://fcm.googleapis.com:8443/x", "https://localhost/x", "nada",
  ])("recusa %s", (u) => expect(pushHost(u)).toBe(false));
});
