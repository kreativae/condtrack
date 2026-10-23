"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { chooseQuote } from "@/app/actions/suppliers";
import { useFormSubmit } from "@/components/use-form-submit";
import { SubmitButton } from "@/components/submit-button";
import { Sheet } from "@/components/portaria/gate-actions";
import { Alert, Button, Textarea } from "@/components/ui";

/** "Escolher este": aprova e, se marcado, recusa os outros que aguardam para o mesmo serviço. */
export function ChooseButton({ quoteId, supplier, value, others, cheapest }: { quoteId: string; supplier: string; value: string; others: number; cheapest: boolean }) {
  const [open, setOpen] = useState(false);
  const [rejectOthers, setRejectOthers] = useState(true);
  const [state, form, pending] = useFormSubmit(chooseQuote.bind(null, quoteId, others > 0 && rejectOthers));
  if (state?.ok) return <p className="flex items-center justify-center gap-1.5 text-sm font-medium text-ok"><Check className="size-4" />Escolhido</p>;
  return (
    <>
      <Button type="button" variant={cheapest ? "success" : "outline"} className="w-full" onClick={() => setOpen(true)}><Check className="size-4" />Escolher este</Button>
      <Sheet open={open} onClose={() => !pending && setOpen(false)} title="Aprovar orçamento">
        <form {...form} className="space-y-4">
          <p className="text-sm text-fg-2">Aprovar <b>{supplier}</b> por <b>{value}</b>. Quem cadastrou recebe o aviso.</p>
          {!cheapest && <p className="rounded-xl bg-warn/10 px-3 py-2 text-xs text-fg-2 ring-1 ring-inset ring-warn/15">Não é o menor preço. Vale escrever o motivo da escolha (fica no histórico).</p>}
          <Textarea name="note" rows={3} maxLength={1000} placeholder="Observação (opcional): ex.: melhor prazo e garantia maior" autoFocus />
          {others > 0 && (
            <label className="flex items-start gap-3 rounded-xl px-3 py-2.5 ring-1 ring-line">
              <input type="checkbox" checked={rejectOthers} onChange={(e) => setRejectOthers(e.target.checked)} className="mt-0.5 size-4 accent-[var(--brand)]" />
              <span className="text-sm">
                Recusar {others === 1 ? "o outro orçamento" : `os outros ${others} orçamentos`} deste serviço
                <span className="block text-xs text-muted">Com o motivo “Escolhido outro fornecedor”. Cada um é avisado.</span>
              </span>
            </label>
          )}
          {state?.error && <Alert>{state.error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Cancelar</Button>
            <SubmitButton pending={pending} variant="success">Confirmar aprovação</SubmitButton>
          </div>
        </form>
      </Sheet>
    </>
  );
}
