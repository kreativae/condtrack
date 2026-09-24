"use client";

import { useFormSubmit } from "@/components/use-form-submit";
import { useActionState } from "react";
import { changePassword, updateProfile } from "@/app/actions/misc";
import { Alert, Field, Input } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export function ProfileForm({ name, phone }: { name: string; phone: string | null }) {
  const [state, form, pending] = useFormSubmit(updateProfile);
  return (
    <form {...form} className="space-y-4">
      <Field label="Nome"><Input name="name" defaultValue={name} required /></Field>
      <Field label="Telefone / WhatsApp"><Input name="phone" defaultValue={phone ?? ""} /></Field>
      {state?.error && <Alert>{state.error}</Alert>}
      {state?.message && <Alert tone="ok">{state.message}</Alert>}
      <SubmitButton pending={pending}>Salvar</SubmitButton>
    </form>
  );
}

export function PasswordForm() {
  const [state, form, pending] = useFormSubmit(changePassword);
  return (
    <form {...form} className="space-y-4">
      <Field label="Senha atual"><Input type="password" name="current" required autoComplete="current-password" /></Field>
      <Field label="Nova senha" hint="Mínimo de 8 caracteres."><Input type="password" name="next" required minLength={8} autoComplete="new-password" /></Field>
      <Field label="Confirmar nova senha"><Input type="password" name="confirm" required autoComplete="new-password" /></Field>
      {state?.error && <Alert>{state.error}</Alert>}
      {state?.message && <Alert tone="ok">{state.message}</Alert>}
      <SubmitButton pending={pending} variant="outline">Alterar senha</SubmitButton>
    </form>
  );
}
