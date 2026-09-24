"use client";

import { useFormSubmit } from "@/components/use-form-submit";
import { useActionState } from "react";
import { Trash2 } from "lucide-react";
import { adminDeleteOrder } from "@/app/actions/orders";
import { Alert, Input } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export function AdminDeleteOrder({ id, protocol }: { id: string; protocol: string }) {
  const [state, form, pending] = useFormSubmit(adminDeleteOrder.bind(null, id));
  return (
    <details className="group rounded-2xl border border-bad/25 p-4 text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-medium text-bad"><Trash2 className="size-4" />Excluir esta OS…</summary>
      <form {...form} className="mt-3 space-y-3">
        <p className="text-xs text-muted">Remove definitivamente a OS, fotos, vídeos e linha do tempo. A exclusão fica registrada na auditoria. Digite <b className="text-fg">{protocol}</b> para confirmar.</p>
        <Input name="confirm" placeholder={protocol} autoComplete="off" required />
        {state?.error && <Alert>{state.error}</Alert>}
        <SubmitButton pending={pending} variant="danger" className="w-full" pendingText="Excluindo…">Excluir definitivamente</SubmitButton>
      </form>
    </details>
  );
}
