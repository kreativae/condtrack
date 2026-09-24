"use client";

import { useFormSubmit } from "@/components/use-form-submit";
import { useActionState } from "react";
import { adminChangePlan } from "@/app/actions/billing";
import { Alert, Field, Select } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { brl } from "@/lib/billing-shared";

export function AdminPlanForm({ condominiumId, plans, planId, interval }: { condominiumId: string; plans: { id: string; name: string; monthlyPrice: number; yearlyPrice: number }[]; planId: string | null; interval: string }) {
  const [state, form, pending] = useFormSubmit(adminChangePlan.bind(null, condominiumId));
  return (
    <form {...form} className="space-y-4">
      <Field label="Plano">
        <Select name="planId" defaultValue={planId ?? ""}>
          {plans.map((p) => <option key={p.id} value={p.id}>{p.name} — {brl(p.monthlyPrice)}/mês · {brl(p.yearlyPrice)}/ano</option>)}
        </Select>
      </Field>
      <Field label="Periodicidade">
        <Select name="interval" defaultValue={interval}>
          <option value="month">Mensal</option>
          <option value="year">Anual</option>
        </Select>
      </Field>
      {state?.error && <Alert>{state.error}</Alert>}
      {state?.message && <Alert tone="ok">{state.message}</Alert>}
      <SubmitButton pending={pending} className="w-full" pendingText="Alterando…">Aplicar (com proration)</SubmitButton>
    </form>
  );
}
