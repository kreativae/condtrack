"use client";

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { useFormSubmit } from "@/components/use-form-submit";
import { resetPasswordWithToken } from "@/app/actions/password-reset";
import { Alert, Field, Input, buttonClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export function ResetForm({ token }: { token: string }) {
  const [state, form, pending] = useFormSubmit(resetPasswordWithToken);
  if (state?.ok) {
    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-ok/30 bg-ok/5 p-5 text-sm text-fg-2">
          <CheckCircle2 className="mb-2 size-6 text-ok" />
          {state.message}
        </div>
        <Link href="/login" className={buttonClass("brand") + " w-full"}>Entrar</Link>
      </div>
    );
  }
  return (
    <form {...form} className="space-y-5">
      <input type="hidden" name="token" value={token} />
      <Field label="Nova senha"><Input name="password" type="password" autoComplete="new-password" minLength={8} required autoFocus /></Field>
      <Field label="Confirme a nova senha"><Input name="confirm" type="password" autoComplete="new-password" minLength={8} required /></Field>
      {state?.error && <Alert>{state.error}</Alert>}
      <SubmitButton pending={pending} className="w-full" pendingText="Salvando…">Salvar nova senha</SubmitButton>
    </form>
  );
}
