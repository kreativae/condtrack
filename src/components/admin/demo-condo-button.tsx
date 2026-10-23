"use client";

import { useActionState, useState } from "react";
import { createPortal } from "react-dom";
import { FlaskConical, Loader2, X } from "lucide-react";
import { Alert, Button, Field, Input, buttonClass } from "@/components/ui";
import { DEMO_SLOTS, type DemoAccounts } from "@/lib/demo-accounts";
import { createDemoCondo, type DemoState } from "@/app/actions/demo";

/**
 * Cria um condomínio de demonstração com dados fictícios, vinculado como síndico ao e-mail escolhido. Os outros perfis
 * podem usar contas reais (já vêm com os e-mails da última vez); em branco, entra uma pessoa fictícia.
 */
export function DemoCondoButton({ saved }: { saved: DemoAccounts }) {
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
          <form action={action} className="relative flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-surface shadow-pop animate-in sm:rounded-3xl">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div>
                <p className="font-display text-lg font-semibold">Condomínio de demonstração</p>
                <p className="text-xs text-muted">Dados fictícios em todas as páginas.</p>
              </div>
              <button type="button" onClick={close} aria-label="Fechar" className="inline-flex size-9 items-center justify-center rounded-xl text-fg-2 hover:bg-bg-2"><X className="size-5" /></button>
            </div>
            <div className="space-y-4 overflow-y-auto px-5 py-5">
              <p className="text-sm text-fg-2">
                Cria um condomínio com nome sorteado e dados fictícios em todas as páginas: ordens de serviço, financeiro,
                checklist, comunicados, assembleias, portaria, fornecedores e chamados.
              </p>
              <Field label="Síndico" hint="A pessoa precisa já ter cadastro. A senha e o condomínio atual dela não mudam.">
                <Input name="syndic" type="email" required autoFocus defaultValue={state?.values?.syndic ?? saved.syndic} placeholder="E-mail do síndico" />
              </Field>
              <div className="rounded-2xl bg-bg-2 p-4">
                <p className="text-sm font-medium">Contas reais nos outros perfis</p>
                <p className="mb-3 text-xs text-muted">Opcional. Cada conta ganha um vínculo com a demonstração (troca pelo cartão do menu). Em branco, entra uma pessoa fictícia. Os e-mails ficam salvos para a próxima vez.</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {DEMO_SLOTS.filter((s) => s.key !== "syndic").map((s) => (
                    <Field key={s.key} label={s.label}>
                      <Input name={s.key} type="email" defaultValue={state?.values?.[s.key] ?? saved[s.key]} placeholder={`E-mail do ${s.label.toLowerCase()}`} />
                    </Field>
                  ))}
                </div>
              </div>
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
