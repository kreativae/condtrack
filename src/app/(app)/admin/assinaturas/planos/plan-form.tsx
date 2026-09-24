"use client";

import { useFormSubmit } from "@/components/use-form-submit";
import { useActionState } from "react";
import { savePlan } from "@/app/actions/billing";
import { Alert, Field, Input, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

type Plan = { id: string; name: string; description: string | null; maxUnits: number | null; monthlyPrice: number; yearlyPrice: number; features: string; active: boolean };

export function PlanForm({ plan }: { plan: Plan }) {
  const [state, form, pending] = useFormSubmit(savePlan.bind(null, plan.id));
  const features: string[] = JSON.parse(plan.features);
  return (
    <form {...form} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome"><Input name="name" defaultValue={plan.name} required /></Field>
        <Field label="Limite de unidades" hint="Vazio = ilimitado"><Input name="maxUnits" type="number" min={1} defaultValue={plan.maxUnits ?? ""} /></Field>
        <Field label="Mensal (R$)"><Input name="monthlyPrice" type="number" step="0.01" min={1} defaultValue={plan.monthlyPrice / 100} required /></Field>
        <Field label="Anual (R$)" hint="Padrão: 11× o mensal (1 mês grátis)"><Input name="yearlyPrice" type="number" step="0.01" min={1} defaultValue={plan.yearlyPrice / 100} required /></Field>
      </div>
      <Field label="Descrição"><Input name="description" defaultValue={plan.description ?? ""} /></Field>
      <Field label="Recursos" hint="Um por linha — aparecem no card do plano"><Textarea name="features" rows={4} defaultValue={features.join("\n")} /></Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={plan.active} className="size-4 accent-[var(--brand)]" /> Disponível para novas assinaturas
      </label>
      {state?.error && <Alert>{state.error}</Alert>}
      {state?.message && <Alert tone="ok">{state.message}</Alert>}
      <SubmitButton pending={pending} pendingText="Salvando…">Salvar plano</SubmitButton>
    </form>
  );
}
