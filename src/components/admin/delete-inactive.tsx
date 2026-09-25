"use client";

import { Trash2 } from "lucide-react";
import { deleteInactiveUsers } from "@/app/actions/admin";
import { useFormSubmit } from "@/components/use-form-submit";
import { Alert, Input } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

/** Exclusão em lote dos usuários inativos (com confirmação digitada). */
export function DeleteInactiveUsers({ count }: { count: number }) {
  const [state, form, pending] = useFormSubmit(deleteInactiveUsers);
  if (!count && !state?.message) return null;
  return (
    <details className="group relative">
      <summary className="inline-flex h-10 cursor-pointer list-none items-center gap-2 rounded-xl border border-bad/30 px-4 text-sm font-medium text-bad transition hover:bg-bad/10">
        <Trash2 className="size-4" />Excluir inativos{count ? ` (${count})` : ""}
      </summary>
      <div className="absolute right-0 z-30 mt-2 w-80 rounded-2xl border border-line bg-surface p-4 shadow-pop">
        <form {...form} className="space-y-3 text-sm">
          <p className="text-fg-2">Exclui do banco os <b>{count}</b> usuário(s) desativado(s). O histórico das OS é mantido e passa a mostrar “Usuário excluído”.</p>
          <Input name="confirm" placeholder="Digite EXCLUIR" autoComplete="off" required />
          {state?.error && <Alert>{state.error}</Alert>}
          {state?.message && <Alert tone="ok">{state.message}</Alert>}
          <SubmitButton pending={pending} variant="danger" className="w-full" pendingText="Excluindo…">Excluir definitivamente</SubmitButton>
        </form>
      </div>
    </details>
  );
}
