"use client";

import { createFirstAdmin } from "@/app/actions/setup";
import { useFormSubmit } from "@/components/use-form-submit";
import { Alert, Field, Input } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export function SetupForm() {
  const [state, form, pending] = useFormSubmit(createFirstAdmin);
  return (
    <form {...form} className="space-y-5">
      <Field label="Código de instalação" hint="O valor da variável SETUP_TOKEN configurada na Vercel.">
        <Input name="token" type="password" autoComplete="off" required />
      </Field>
      <div className="border-t border-line pt-5" />
      <Field label="Seu nome completo"><Input name="name" autoComplete="name" required minLength={3} /></Field>
      <Field label="E-mail (será o seu login)"><Input name="email" type="email" autoComplete="email" required /></Field>
      <Field label="Senha" hint="Mínimo de 10 caracteres."><Input name="password" type="password" autoComplete="new-password" required minLength={10} /></Field>
      <Field label="Confirmar senha"><Input name="confirm" type="password" autoComplete="new-password" required minLength={10} /></Field>
      {state?.error && <Alert>{state.error}</Alert>}
      <SubmitButton pending={pending} className="w-full" pendingText="Criando…">Criar conta de administrador</SubmitButton>
    </form>
  );
}
