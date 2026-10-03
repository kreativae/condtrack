"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { ArchiveRestore, Loader2, Trash2, X } from "lucide-react";
import { archiveCondominium, restoreCondominium, type AdminState } from "@/app/actions/admin";
import { useFormSubmit } from "@/components/use-form-submit";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Button, Field, Input, Textarea, buttonClass } from "@/components/ui";

/** "Excluir" condomínio real = arquivar, com confirmação pelo nome. */
export function ArchiveCondoButton({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [state, form, pending] = useFormSubmit((p: AdminState, f: FormData) => archiveCondominium(id, p, f));
  const ok = typed.trim().toLowerCase() === name.trim().toLowerCase();
  const close = () => !pending && setOpen(false);
  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}><Trash2 className="size-4" />Excluir condomínio</Button>
      {/* Portal no <body>: a animação de entrada da página prende elementos "fixed" dentro dela */}
      {open && createPortal(
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Excluir condomínio">
          <div className="absolute inset-0 bg-black/40" onClick={close} />
          <form {...form} className="relative w-full max-w-md overflow-hidden rounded-t-3xl bg-surface shadow-pop animate-in sm:rounded-3xl">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <p className="font-display text-lg font-semibold">Excluir condomínio</p>
              <button type="button" onClick={close} aria-label="Fechar" className="inline-flex size-9 items-center justify-center rounded-xl text-fg-2 hover:bg-bg-2"><X className="size-5" /></button>
            </div>
            <div className="space-y-4 px-5 py-5 text-sm text-fg-2">
              <p><b className="text-fg">{name}</b> sai de toda a plataforma: menus, listas, relatórios e avisos automáticos.</p>
              <ul className="list-disc space-y-1 pl-5">
                <li>Os dados (ordens de serviço, fotos, financeiro, assembleias, histórico) <b className="text-fg">ficam guardados</b> e voltam se você restaurar.</li>
                <li>Quem também participa de outro condomínio passa para ele. Quem só tinha este fica com o acesso desativado até a restauração.</li>
                <li>A assinatura precisa estar cancelada.</li>
              </ul>
              <Field label="Motivo (opcional)"><Textarea name="reason" rows={2} maxLength={500} /></Field>
              <Field label={`Para confirmar, digite: ${name}`}>
                <Input name="confirm" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
              </Field>
              {state?.error && <Alert>{state.error}</Alert>}
            </div>
            <div className="flex justify-end gap-2 border-t border-line px-5 py-4">
              <button type="button" onClick={close} disabled={pending} className={buttonClass("ghost")}>Cancelar</button>
              <SubmitButton pending={pending} pendingText="Excluindo…" variant="danger" disabled={!ok}>Excluir condomínio</SubmitButton>
            </div>
          </form>
        </div>,
        document.body,
      )}
    </>
  );
}

export function RestoreCondoButton({ id, size }: { id: string; size?: "sm" | "md" }) {
  const [pending, start] = useTransition();
  return (
    <Button variant="outline" size={size} disabled={pending} onClick={() => start(() => restoreCondominium(id))}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : <ArchiveRestore className="size-4" />}Restaurar
    </Button>
  );
}
