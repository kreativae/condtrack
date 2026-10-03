// Condtrack: service worker só para as notificações no celular/computador (Web Push).
// Não faz cache de páginas: o app continua sempre online e atualizado.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Condtrack", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Condtrack";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/badge-96.png",
      tag: data.tag || undefined,
      renotify: !!data.tag,
      data: { url: data.url || "/notificacoes" },
    }),
  );
});

// Toque na notificação: foca uma aba do Condtrack já aberta (indo para o link) ou abre uma nova
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/notificacoes", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (new URL(client.url).origin === self.location.origin && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});

// O navegador renovou a inscrição (chaves novas): avisa o servidor, senão as notificações
// seguintes chegam com as chaves antigas e são descartadas sem aviso.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const old = event.oldSubscription;
      let sub = event.newSubscription;
      const key = old && old.options ? old.options.applicationServerKey : null;
      if (!sub && key) sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      if (!sub) return;
      await fetch("/api/push/assinatura", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON(), oldEndpoint: old ? old.endpoint : null }),
      });
    })(),
  );
});
