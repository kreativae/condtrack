"use client";

import { MailCheck } from "lucide-react";
import { useFormSubmit } from "@/components/use-form-submit";
import { requestPasswordReset } from "@/app/actions/password-reset";
import { Alert, Field, Input } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export function ForgotForm() {
  const [state, form, pending] = useFormSubmit(requestPasswordReset);
  if (state?.ok) {
    return (
      <div className="rounded-2xl border border-ok/30 bg-ok/5 p-5 text-sm text-fg-2">
        <MailCheck className="mb-2 size-6 text-ok" />
        {state.message}
      </div>
    );
  }
  return (
    <form {...form} className="space-y-5">
      <Field label="E-mail">
        <Input name="email" type="email" autoComplete="username" required autoFocus placeholder="voce@condominio.com" />
      </Field>
      {state?.error && <Alert>{state.error}</Alert>}
      <SubmitButton pending={pending} className="w-full" pendingText="Enviando…">Enviar link</SubmitButton>
    </form>
  );
}
