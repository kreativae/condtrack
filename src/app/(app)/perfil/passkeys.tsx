"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ScanFace, Smartphone, Trash2 } from "lucide-react";
import { browserSupportsWebAuthn, startRegistration, WebAuthnError } from "@simplewebauthn/browser";
import type { PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/browser";
import { deletePasskey, passkeyRegistrationOptions, verifyPasskeyRegistration } from "@/app/actions/passkeys";
import { Alert, buttonClass } from "@/components/ui";

type Item = { id: string; name: string; createdAt: string; lastUsedAt: string | null };

const fmt = (d: string | null) => (d ? new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "nunca");

export function PasskeysCard({ items, disabledReason }: { items: Item[]; disabledReason?: string }) {
  const router = useRouter();
  const [supported, setSupported] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    queueMicrotask(() => setSupported(browserSupportsWebAuthn()));
  }, []);

  async function add() {
    setBusy(true);
    setMsg(null);
    try {
      const opts = await passkeyRegistrationOptions();
      if (!opts.ok) throw new Error(opts.error);
      const response = await startRegistration({ optionsJSON: opts.data as PublicKeyCredentialCreationOptionsJSON });
      const res = await verifyPasskeyRegistration(response);
      if (!res.ok) throw new Error(res.error);
      setMsg({ tone: "ok", text: "Biometria cadastrada! Na próxima vez, use “Entrar com Face ID” na tela de login." });
      router.refresh();
    } catch (e) {
      if (e instanceof WebAuthnError && e.code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED") setMsg({ tone: "bad", text: "Este aparelho já está cadastrado." });
      else if (e instanceof Error && e.name === "NotAllowedError") setMsg(null);
      else setMsg({ tone: "bad", text: e instanceof Error ? e.message : "Não foi possível cadastrar." });
    }
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Entre sem senha usando Face ID, Touch ID, digital ou Windows Hello. A biometria fica no seu aparelho — o Condtrack nunca a recebe.</p>
      {items.length > 0 && (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {items.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-4 py-3">
              <span className="flex size-9 items-center justify-center rounded-xl bg-brand-soft text-brand"><Smartphone className="size-4" /></span>
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium">{p.name}</p>
                <p className="text-xs text-muted">Cadastrado em {fmt(p.createdAt)} · último uso {fmt(p.lastUsedAt)}</p>
              </div>
              {removing === p.id ? (
                <span className="flex items-center gap-2">
                  <button onClick={() => startTransition(async () => { await deletePasskey(p.id); setRemoving(null); router.refresh(); })} className="rounded-lg bg-bad px-2.5 py-1 text-xs font-semibold text-white">Remover</button>
                  <button onClick={() => setRemoving(null)} className="text-xs text-muted">Cancelar</button>
                </span>
              ) : (
                <button onClick={() => setRemoving(p.id)} title="Remover" className="rounded-lg p-1.5 text-muted hover:bg-bad/10 hover:text-bad"><Trash2 className="size-4" /></button>
              )}
            </li>
          ))}
        </ul>
      )}
      {disabledReason ? (
        <Alert tone="muted">{disabledReason}</Alert>
      ) : supported === false ? (
        <Alert tone="muted">Este navegador não suporta login por biometria.</Alert>
      ) : (
        <button onClick={add} disabled={busy || !supported} className={buttonClass(items.length ? "outline" : "brand")}>
          <ScanFace className="size-4" />
          {busy ? "Aguardando o aparelho…" : items.length ? "Cadastrar outro aparelho" : "Ativar Face ID / biometria neste aparelho"}
        </button>
      )}
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
    </div>
  );
}
