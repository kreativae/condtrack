"use client";

import { useFormSubmit } from "@/components/use-form-submit";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { ScanFace } from "lucide-react";
import { browserSupportsWebAuthn, startAuthentication, WebAuthnError } from "@simplewebauthn/browser";
import type { PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";
import { login } from "@/app/actions/auth";
import { passkeyLoginOptions, verifyPasskeyLogin } from "@/app/actions/passkeys";
import { Alert, Field, Input, buttonClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

declare global {
  interface Window {
    turnstile?: { reset: (el?: string) => void };
  }
}

export function LoginForm({ next, passkeys, turnstileSiteKey }: { next?: string; passkeys: boolean; turnstileSiteKey: string | null }) {
  const [state, form, pending] = useFormSubmit(login);

  // Token do Turnstile é de uso único: renova após cada tentativa
  useEffect(() => {
    if (state?.error) window.turnstile?.reset();
  }, [state]);

  return (
    <div className="space-y-5">
      {passkeys && <PasskeyLogin next={next} />}
      <form {...form} className="space-y-5">
        <input type="hidden" name="next" value={next ?? ""} />
        <Field label="E-mail">
          <Input name="email" type="email" autoComplete="username webauthn" required placeholder="voce@condominio.com" />
        </Field>
        <Field label="Senha">
          <Input name="password" type="password" autoComplete="current-password" required placeholder="••••••••" />
        </Field>
        {turnstileSiteKey && (
          <>
            <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
            <div className="cf-turnstile" data-sitekey={turnstileSiteKey} data-language="pt-br" data-theme="auto" />
          </>
        )}
        {state?.error && <Alert>{state.error}</Alert>}
        <SubmitButton pending={pending} className="w-full" pendingText="Entrando…">
          Entrar
        </SubmitButton>
        <p className="text-center text-xs text-muted">Esqueceu a senha? Solicite a redefinição à administração do condomínio.</p>
      </form>
    </div>
  );
}

function PasskeyLogin({ next }: { next?: string }) {
  const router = useRouter();
  const [supported, setSupported] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Detecção só existe no navegador
    queueMicrotask(() => setSupported(browserSupportsWebAuthn()));
  }, []);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      const opts = await passkeyLoginOptions();
      if (!opts.ok) throw new Error(opts.error);
      const response = await startAuthentication({ optionsJSON: opts.data as PublicKeyCredentialRequestOptionsJSON });
      const res = await verifyPasskeyLogin(response, next);
      if (!res.ok) throw new Error(res.error);
      router.push(res.data!.redirect);
      router.refresh();
    } catch (e) {
      if (e instanceof WebAuthnError && e.code === "ERROR_CEREMONY_ABORTED") setError(null);
      else if (e instanceof Error && e.name === "NotAllowedError") setError("Operação cancelada ou nenhuma biometria cadastrada neste aparelho.");
      else setError(e instanceof Error ? e.message : "Não foi possível entrar com biometria.");
      setBusy(false);
    }
  }

  if (supported === false) return null;
  return (
    <div>
      <button type="button" onClick={go} disabled={busy || !supported} className={buttonClass("outline") + " h-11 w-full"}>
        <ScanFace className="size-5 text-brand" />
        {busy ? "Aguardando biometria…" : "Entrar com Face ID / biometria"}
      </button>
      {error && <p className="mt-2 text-xs text-bad">{error}</p>}
      <div className="mt-5 flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-line" /> ou com e-mail e senha <span className="h-px flex-1 bg-line" />
      </div>
    </div>
  );
}
