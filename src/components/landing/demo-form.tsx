"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import Script from "next/script";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { Alert, Field, FieldGroup, Input, Textarea, cx } from "@/components/ui";
import { REQUEST_PROFILES } from "@/lib/demo-request";
import { requestDemo, type DemoRequestState } from "@/app/actions/demo-request";

declare global {
  interface Window {
    turnstile?: { reset: (el?: string) => void };
  }
}

/** "Agende sua demonstração": vai para Interessados (superadmin), que cria a demonstração externa a partir dele. */
export function DemoForm({ turnstileSiteKey }: { turnstileSiteKey: string | null }) {
  const [state, action, pending] = useActionState<DemoRequestState, FormData>(requestDemo, null);
  const [profile, setProfile] = useState(state?.values?.profile || "syndic");
  const v = state?.values ?? {};
  const err = state?.errors ?? {};
  // Token do Turnstile é de uso único: renova depois de cada envio com erro
  useEffect(() => {
    if (state?.error || state?.errors) window.turnstile?.reset();
  }, [state]);

  if (state?.ok) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-[28px] bg-surface p-8 text-center text-fg shadow-pop sm:p-10" role="status">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-ok/12 text-ok"><CheckCircle2 className="size-7" /></span>
        <p className="font-display text-2xl font-bold">Pedido recebido!</p>
        <p className="max-w-sm text-[15px] leading-relaxed text-fg-2">
          Vamos montar o seu condomínio de exemplo e mandar os acessos de cada perfil. Respondemos em até 1 dia útil pelo WhatsApp ou e-mail.
        </p>
      </div>
    );
  }

  const fieldErr = (k: keyof typeof err) => err[k] && <span className="mt-1 block text-xs font-medium text-bad">{err[k]}</span>;
  const big = "h-12 rounded-2xl text-[15px]";

  return (
    <form action={action} className="flex flex-col gap-4 rounded-[28px] bg-surface p-6 text-fg shadow-pop sm:p-8" noValidate>
      <p className="font-display text-[22px] font-bold">Agende sua demonstração</p>
      {/* Pega robôs: invisível para pessoas, preenchido por quem completa todos os campos */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>Site <input name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>
      <div>
        <Field label="Seu nome"><Input name="name" required autoComplete="name" defaultValue={v.name} placeholder="Nome e sobrenome" className={big} aria-invalid={!!err.name} /></Field>
        {fieldErr("name")}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Field label="WhatsApp"><Input name="phone" type="tel" inputMode="tel" required autoComplete="tel" defaultValue={v.phone} placeholder="(11) 98888-7777" className={big} aria-invalid={!!err.phone} /></Field>
          {fieldErr("phone")}
        </div>
        <div>
          <Field label="E-mail"><Input name="email" type="email" required autoComplete="email" defaultValue={v.email} placeholder="voce@email.com" className={big} aria-invalid={!!err.email} /></Field>
          {fieldErr("email")}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem]">
        <div>
          <Field label="Nome do condomínio"><Input name="condoName" required autoComplete="organization" defaultValue={v.condoName} placeholder="Residencial…" className={big} aria-invalid={!!err.condoName} /></Field>
          {fieldErr("condoName")}
        </div>
        <div>
          <Field label="Unidades"><Input name="units" type="number" min={1} inputMode="numeric" defaultValue={v.units} placeholder="Ex.: 96" className={big} aria-invalid={!!err.units} /></Field>
          {fieldErr("units")}
        </div>
      </div>
      <FieldGroup label="Você é">
        <div className="flex flex-wrap gap-2">
          {REQUEST_PROFILES.map((p) => (
            <label
              key={p.key}
              className={cx(
                "flex h-10 cursor-pointer items-center rounded-full border-[1.5px] px-4 text-sm font-semibold transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand",
                profile === p.key ? "border-brand bg-brand-soft text-brand" : "border-line-strong text-fg-2 hover:bg-bg-2",
              )}
            >
              <input type="radio" name="profile" value={p.key} checked={profile === p.key} onChange={() => setProfile(p.key)} className="sr-only" />
              {p.label}
            </label>
          ))}
        </div>
        {fieldErr("profile")}
      </FieldGroup>
      <Field label="Quer contar algo? (opcional)">
        <Textarea name="message" rows={2} defaultValue={v.message} placeholder="Ex.: temos 3 torres e trocamos de administradora este ano" className="rounded-2xl text-[15px]" />
      </Field>
      {turnstileSiteKey && (
        <>
          <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
          <div className="cf-turnstile" data-sitekey={turnstileSiteKey} data-language="pt-br" data-theme="light" />
        </>
      )}
      {state?.error && <Alert>{state.error}</Alert>}
      <button type="submit" disabled={pending} className="btn-brand mt-1 flex h-14 items-center justify-center gap-2.5 rounded-full text-base font-bold transition disabled:opacity-70">
        {pending ? <Loader2 className="size-5 animate-spin" /> : null}
        {pending ? "Enviando…" : "Quero minha demonstração"}
        {!pending && <ArrowRight className="size-5" />}
      </button>
      <p className="text-center text-xs text-muted">
        Respondemos em até 1 dia útil. Seus dados seguem a nossa <Link href="/privacidade" className="font-semibold text-brand hover:underline">política de privacidade</Link>.
      </p>
    </form>
  );
}
