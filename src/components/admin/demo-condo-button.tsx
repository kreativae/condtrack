"use client";

import { useActionState, useState } from "react";
import { createPortal } from "react-dom";
import { FlaskConical, Loader2, Presentation, Users, X } from "lucide-react";
import { Alert, Button, Field, Input, buttonClass, cx } from "@/components/ui";
import { DEMO_PASSWORD, DEMO_SLOTS, externalDemoAccounts, type DemoAccounts } from "@/lib/demo-accounts";
import { createDemoCondo, type DemoState } from "@/app/actions/demo";

/**
 * Cria um condomínio de demonstração com dados fictícios, vinculado como síndico ao e-mail escolhido. Os outros perfis
 * podem usar contas reais (já vêm com os e-mails da última vez); em branco, entra uma pessoa fictícia.
 * Interna = as contas de apresentação do superadmin; externa = série numerada nova (sindicoN@, zeladorN@…) para testes.
 */
export function DemoCondoButton({ saved, nextExternal }: { saved: DemoAccounts; nextExternal: number }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<DemoState, FormData>(createDemoCondo, null);
  const [mode, setMode] = useState<"internal" | "external">("internal");
  const close = () => !pending && setOpen(false);
  const external = externalDemoAccounts(nextExternal);
  const MODES = [
    { key: "internal", label: "Interna", hint: "Suas apresentações", icon: Presentation },
    { key: "external", label: "Externa", hint: `Para testes: série ${nextExternal}`, icon: Users },
  ] as const;

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
              <input type="hidden" name="mode" value={mode} />
              <div role="radiogroup" aria-label="Tipo de demonstração" className="grid grid-cols-2 gap-2">
                {MODES.map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    role="radio"
                    aria-checked={mode === m.key}
                    onClick={() => setMode(m.key)}
                    className={cx("flex items-center gap-3 rounded-2xl border p-3 text-left transition", mode === m.key ? "border-brand bg-brand/5 ring-1 ring-brand" : "border-line hover:bg-bg-2")}
                  >
                    <m.icon className={cx("size-5 shrink-0", mode === m.key ? "text-brand" : "text-muted")} />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{m.label}</span>
                      <span className="block truncate text-xs text-muted">{m.hint}</span>
                    </span>
                  </button>
                ))}
              </div>
              {mode === "internal" ? (
                <>
                  <Field label="Síndico" hint={`Se a conta não existir, é criada com a senha ${DEMO_PASSWORD}. Contas que já existem mantêm a senha.`}>
                    <Input name="syndic" type="email" required autoFocus defaultValue={state?.values?.syndic ?? saved.syndic} placeholder="E-mail do síndico" />
                  </Field>
                  <div className="rounded-2xl bg-bg-2 p-4">
                    <p className="text-sm font-medium">Contas reais nos outros perfis</p>
                    <p className="mb-3 text-xs text-muted">Cada conta ganha um vínculo com a demonstração (troca pelo cartão do menu); a que não existir é criada com a senha {DEMO_PASSWORD}. Em branco, entra uma pessoa fictícia. Os e-mails ficam salvos para a próxima vez.</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {DEMO_SLOTS.filter((s) => s.key !== "syndic").map((s) => (
                        <Field key={s.key} label={s.label}>
                          <Input name={s.key} type="email" defaultValue={state?.values?.[s.key] ?? saved[s.key]} placeholder={`E-mail do ${s.label.toLowerCase()}`} />
                        </Field>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="rounded-2xl bg-bg-2 p-4">
                  <p className="text-sm font-medium">Contas novas desta demonstração</p>
                  <p className="mb-3 text-xs text-muted">Uma série numerada para cada demonstração externa, então um teste não mexe no outro. Todas com a senha <span className="font-mono font-medium text-fg">{DEMO_PASSWORD}</span>.</p>
                  <dl className="grid gap-2 sm:grid-cols-2">
                    {DEMO_SLOTS.map((s) => (
                      <div key={s.key} className="min-w-0 rounded-xl bg-surface px-3 py-2">
                        <dt className="text-xs text-muted">{s.label}</dt>
                        <dd className="break-all font-mono text-[13px]">{external[s.key]}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-3 text-xs text-muted">Se outra demonstração externa for criada antes, esta fica com o próximo número livre.</p>
                </div>
              )}
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
