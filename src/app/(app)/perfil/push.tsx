"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BellRing, Loader2, Send, Smartphone, Trash2 } from "lucide-react";
import { subscribePush, testPush, unsubscribePush } from "@/app/actions/push";
import { Alert, Button } from "@/components/ui";

type Device = { id: string; name: string; endpoint: string; createdAt: string; lastUsedAt: string | null };
type Support = "loading" | "ok" | "ios-install" | "unsupported" | "denied";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** "iPhone", "Android", "Chrome no Mac"… para a lista de aparelhos. */
function deviceName() {
  const ua = navigator.userAgent;
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Mac/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
  if (os === "iPhone" || os === "iPad" || os === "Android") return os;
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Navegador";
  return os ? `${browser} no ${os}` : browser;
}

const fmt = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");

export function PushCard({ publicKey, devices, disabledReason }: { publicKey: string | null; devices: Device[]; disabledReason?: string }) {
  const router = useRouter();
  const [support, setSupport] = useState<Support>("loading");
  const [current, setCurrent] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    // Detecção só existe no navegador
    queueMicrotask(async () => {
      const ios = /iPhone|iPad/.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setSupport(ios && !standalone ? "ios-install" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") setSupport("denied");
      else setSupport("ok");
      const reg = await navigator.serviceWorker.getRegistration("/");
      // Atualiza o service worker (pega a versão nova do sw.js) e reenvia a inscrição atual:
      // se o navegador trocou as chaves, o servidor passa a usar as novas
      reg?.update().catch(() => null);
      const sub = await reg?.pushManager.getSubscription();
      setCurrent(sub?.endpoint ?? null);
      if (sub && Notification.permission === "granted") subscribePush(sub.toJSON(), deviceName(), true).catch(() => null);
    });
  }, []);

  if (disabledReason) return <p className="text-sm text-muted">{disabledReason}</p>;
  if (!publicKey) return <p className="text-sm text-muted">As notificações no celular ainda não foram configuradas pela administração.</p>;

  const here = current ? devices.find((d) => d.endpoint === current) : undefined;

  const enable = () =>
    start(async () => {
      setMsg(null);
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setSupport(permission === "denied" ? "denied" : "ok");
          return;
        }
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
        await navigator.serviceWorker.ready;
        const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }));
        const r = await subscribePush(sub.toJSON(), deviceName());
        if (!r.ok) return setMsg({ tone: "bad", text: r.error ?? "Não foi possível ativar." });
        setCurrent(sub.endpoint);
        setMsg({ tone: "ok", text: "Ativado neste aparelho." });
        router.refresh();
      } catch {
        setMsg({ tone: "bad", text: "Não foi possível ativar neste navegador." });
      }
    });

  const disableHere = () =>
    start(async () => {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await unsubscribePush({ endpoint: sub.endpoint });
        await sub.unsubscribe().catch(() => null);
      }
      setCurrent(null);
      setMsg(null);
      router.refresh();
    });

  const remove = (id: string) =>
    start(async () => {
      await unsubscribePush({ id });
      router.refresh();
    });

  const test = () =>
    start(async () => {
      const r = await testPush();
      setMsg(r.ok ? { tone: "ok", text: `Teste enviado para ${r.sent} ${r.sent === 1 ? "aparelho" : "aparelhos"}.` } : { tone: "bad", text: r.error ?? "Não foi possível enviar." });
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-bg-2 text-brand"><BellRing className="size-5" /></span>
          <p className="text-sm text-fg-2">
            {here
              ? "Este aparelho recebe as notificações do Condtrack, mesmo com o app fechado."
              : "Receba no celular (ou no computador) as mesmas notificações do sino: novas OS, aprovações, checklist, documentos vencendo…"}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {support === "ok" && !here && (
            <Button onClick={enable} disabled={pending}>{pending ? <Loader2 className="size-4 animate-spin" /> : <BellRing className="size-4" />}Ativar neste aparelho</Button>
          )}
          {here && <Button variant="outline" onClick={disableHere} disabled={pending}>Desativar neste aparelho</Button>}
          {devices.length > 0 && <Button variant="outline" onClick={test} disabled={pending}><Send className="size-4" />Enviar teste</Button>}
        </div>
      </div>

      {support === "ios-install" && (
        <Alert tone="info">
          No iPhone, as notificações funcionam com o Condtrack na tela de início (iOS 16.4 ou mais novo): toque em <b>Compartilhar</b> → <b>Adicionar à Tela de Início</b>, abra o Condtrack por lá e ative aqui.
        </Alert>
      )}
      {support === "unsupported" && <Alert tone="warn">Este navegador não aceita notificações. Use o Chrome, Edge, Firefox ou Safari atualizados.</Alert>}
      {support === "denied" && <Alert tone="warn">As notificações estão bloqueadas para este site. Libere nas configurações do navegador (ícone de cadeado ao lado do endereço) e tente de novo.</Alert>}
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}

      {devices.length > 0 && (
        <ul className="divide-y divide-line rounded-2xl ring-1 ring-line">
          {devices.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-4 py-3">
              <Smartphone className="size-4 shrink-0 text-muted" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{d.name || "Aparelho"}{d.endpoint === current && <span className="ml-2 text-xs font-normal text-brand">este aparelho</span>}</p>
                <p className="text-xs text-muted">Desde {fmt(d.createdAt)}{d.lastUsedAt && ` · última notificação ${fmt(d.lastUsedAt)}`}</p>
              </div>
              <button type="button" onClick={() => remove(d.id)} disabled={pending} aria-label="Remover aparelho" className="inline-flex size-9 items-center justify-center rounded-xl text-muted hover:bg-bg-2 hover:text-bad"><Trash2 className="size-4" /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
