"use client";

import { useActionState, useState } from "react";
import { createPortal } from "react-dom";
import { FlaskConical, Loader2, X } from "lucide-react";
import { Alert, Button, Field, Input, buttonClass } from "@/components/ui";
import { createDemoCondo, type DemoState } from "@/app/actions/demo";

/** Cria um condomínio de demonstração com dados fictícios, vinculado como síndico ao e-mail escolhido. */
export function DemoCondoButton() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<DemoState, FormData>(createDemoCondo, null);
  const close = () => !pending && setOpen(false);

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <FlaskConical className="size-4" />Condomínio de demonstração
      </Button>

      {/* Portal no <body>: a animação de entrada da página prende elementos "fixed" dentro dela */}
      {open && createPortal(
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Condomínio de demonstração">
          <div className="absolute inset-0 bg-black/40" onClick={close} />
          <form action={action} className="relative w-full max-w-md overflow-hidden rounded-t-3xl bg-surface shadow-pop animate-in sm:rounded-3xl">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div>
                <p className="font-display text-lg font-semibold">Condomínio de demonstração</p>
                <p className="text-xs text-muted">Dados fictícios em todas as páginas.</p>
              </div>
              <button type="button" onClick={close} aria-label="Fechar" className="inline-flex size-9 items-center justify-center rounded-xl text-fg-2 hover:bg-bg-2"><X className="size-5" /></button>
            </div>
            <div className="space-y-4 px-5 py-5">
              <p className="text-sm text-fg-2">
                Cria o “Residencial Vila das Acácias” com ordens de serviço, financeiro dos últimos 4 meses, checklist das
                últimas semanas e comunicados.
              </p>
              <Field label="Vincular como síndico" hint="A pessoa precisa já ter cadastro. A senha e o condomínio atual dela não mudam.">
                <Input name="email" type="email" required autoFocus defaultValue="sindico@condtrack.app" placeholder="email@exemplo.com" />
              </Field>
              {state?.error && <Alert>{state.error}</Alert>}
            </div>
            <div className="flex justify-end gap-2 border-t border-line px-5 py-4">
              <button type="button" onClick={close} disabled={pending} className={buttonClass("ghost")}>Cancelar</button>
              <button type="submit" disabled={pending} className={buttonClass("brand")}>
                {pending && <Loader2 className="size-4 animate-spin" />}
                {pending ? "Gerando dados…" : "Criar"}
              </button>
            </div>
          </form>
        </div>,
        document.body,
      )}
    </>
  );
}
