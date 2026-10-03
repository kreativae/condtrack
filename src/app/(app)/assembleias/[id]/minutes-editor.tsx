"use client";

import { saveMinutes, type AssemblyState } from "@/app/actions/assembly";
import { useFormSubmit } from "@/components/use-form-submit";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Textarea } from "@/components/ui";

export function MinutesEditor({ id, initial }: { id: string; initial: string }) {
  const [state, form, pending] = useFormSubmit((p: AssemblyState, f: FormData) => saveMinutes(id, p, f));
  return (
    <form {...form} className="space-y-3">
      <Textarea name="minutes" rows={18} defaultValue={initial} className="font-mono text-[13px] leading-relaxed" />
      <p className="text-xs text-muted">Complete com presenças, presidente e secretário da mesa e o que mais foi tratado. O PDF usa este texto.</p>
      {state?.error && <Alert>{state.error}</Alert>}
      {state?.message && <Alert tone="ok">{state.message}</Alert>}
      <SubmitButton pending={pending} pendingText="Salvando…">Salvar ata</SubmitButton>
    </form>
  );
}
