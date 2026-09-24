"use client";

import { useFormSubmit } from "@/components/use-form-submit";
import { useActionState } from "react";
import type { AdminState } from "@/app/actions/admin";
import { Alert, Field, Input, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

type Condo = { name: string; address: string | null; cnpj: string | null; phone: string | null; email: string | null; accentColor: string };

export function CondoForm({ action, initial }: { action: (s: AdminState, f: FormData) => Promise<AdminState>; initial?: Condo }) {
  const [state, form, pending] = useFormSubmit(action);
  return (
    <form {...form} className="space-y-5">
      <Field label="Nome do condomínio"><Input name="name" required defaultValue={initial?.name} /></Field>
      <Field label="Endereço"><Input name="address" defaultValue={initial?.address ?? ""} /></Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="CNPJ"><Input name="cnpj" defaultValue={initial?.cnpj ?? ""} /></Field>
        <Field label="Telefone"><Input name="phone" defaultValue={initial?.phone ?? ""} /></Field>
        <Field label="E-mail da administração"><Input name="email" type="email" defaultValue={initial?.email ?? ""} /></Field>
        <Field label="Cor de destaque" hint="Identidade visual do condomínio.">
          <Input name="accentColor" type="color" defaultValue={initial?.accentColor ?? "#5B5BD6"} className="h-10 p-1" />
        </Field>
      </div>
      {!initial && (
        <fieldset className="space-y-5 rounded-2xl border border-line p-5">
          <legend className="px-2 text-xs font-medium text-brand">Estrutura inicial</legend>
          <Field label="Torres / blocos" hint="Um por linha. Vazio = Bloco Único.">
            <Textarea name="buildings" rows={3} placeholder={"Torre A\nTorre B"} />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Andares por torre"><Input name="floors" type="number" min={0} max={80} defaultValue={10} /></Field>
            <Field label="Unidades por andar"><Input name="perFloor" type="number" min={0} max={20} defaultValue={4} /></Field>
          </div>
          <p className="text-xs text-muted">Categorias de serviço e áreas comuns padrão serão criadas automaticamente.</p>
        </fieldset>
      )}
      {state?.error && <Alert>{state.error}</Alert>}
      {state?.message && <Alert tone="ok">{state.message}</Alert>}
      <SubmitButton pending={pending}>{initial ? "Salvar alterações" : "Criar condomínio"}</SubmitButton>
    </form>
  );
}
