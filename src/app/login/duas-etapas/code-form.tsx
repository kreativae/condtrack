"use client";

import { useState } from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { verifyLoginCode } from "@/app/actions/two-factor";
import { useFormSubmit } from "@/components/use-form-submit";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Field, Input } from "@/components/ui";

export function CodeForm() {
  const [state, form, pending] = useFormSubmit(verifyLoginCode);
  const [recovery, setRecovery] = useState(false);

  return (
    <div className="space-y-5">
      <div>
        <span className="mb-4 flex size-11 items-center justify-center rounded-xl bg-brand-soft text-brand"><ShieldCheck className="size-5" /></span>
        <h1 className="font-display text-2xl font-bold">Verificação em duas etapas</h1>
        <p className="mt-1.5 text-sm text-muted">
          {recovery ? "Digite um dos códigos de recuperação que você guardou. Cada um vale uma vez." : "Abra o app autenticador no celular e digite o código de 6 dígitos do Condtrack."}
        </p>
      </div>
      <form {...form} className="space-y-5">
        <Field label={recovery ? "Código de recuperação" : "Código do app"}>
          {recovery ? (
            <Input key="rec" name="code" required autoFocus autoComplete="off" autoCapitalize="off" spellCheck={false} placeholder="xxxx-xxxx" className="font-num tracking-wider" />
          ) : (
            <Input key="app" name="code" required autoFocus inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} placeholder="000000" className="font-num text-lg tracking-[0.3em]" />
          )}
        </Field>
        {state?.error && <Alert>{state.error}</Alert>}
        <SubmitButton pending={pending} className="w-full" pendingText="Conferindo…">Entrar</SubmitButton>
      </form>
      <div className="flex items-center justify-between text-xs">
        <button type="button" onClick={() => setRecovery((r) => !r)} className="font-medium text-brand hover:underline">
          {recovery ? "Usar o código do app" : "Perdi o celular: usar código de recuperação"}
        </button>
        <Link href="/login" className="text-muted hover:text-fg">Voltar</Link>
      </div>
    </div>
  );
}
