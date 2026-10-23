"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleSlash, FolderPlus, Lock, Pencil } from "lucide-react";
import { closeGroup, saveGroup, type SupplierState } from "@/app/actions/suppliers";
import { useFormSubmit } from "@/components/use-form-submit";
import { SubmitButton } from "@/components/submit-button";
import { Sheet } from "@/components/portaria/gate-actions";
import { Alert, Button, Field, Input, Textarea, cx } from "@/components/ui";
import { fmtBRL } from "@/lib/finance";

type Opt = { id: string; supplier: string; amountCents: number; status: string };

/**
 * Encerrar a cotação: escolher o contratado (ou "sem contratação", com motivo) e, se quiser,
 * recusar de uma vez os que ainda aguardam. `preset` = botão "Escolher este" de uma coluna.
 */
export function CloseGroupButton({ groupId, quotes, preset, cheapestId, label = "Encerrar cotação", variant = "brand", className }: {
  groupId: string; quotes: Opt[]; preset?: string; cheapestId: string | null; label?: string; variant?: "brand" | "success" | "outline"; className?: string;
}) {
  const options = quotes.filter((q) => q.status === "pending" || q.status === "approved");
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState(preset ?? options.find((q) => q.status === "approved")?.id ?? cheapestId ?? options[0]?.id ?? "");
  const [state, form, pending] = useFormSubmit(closeGroup.bind(null, groupId));
  const others = quotes.filter((q) => q.status === "pending" && q.id !== chosen).length;
  const pick = options.find((q) => q.id === chosen);
  if (state?.ok) return null;
  return (
    <>
      <Button type="button" variant={variant} className={className} onClick={() => setOpen(true)}>
        {preset ? <Check className="size-4" /> : <Lock className="size-4" />}{label}
      </Button>
      <Sheet open={open} onClose={() => !pending && setOpen(false)} title="Encerrar cotação">
        <form {...form} className="space-y-4">
          <input type="hidden" name="chosenQuoteId" value={chosen} />
          <div role="radiogroup" aria-label="Orçamento contratado" className="space-y-2">
            <p className="text-[13px] font-medium text-fg-2">Qual orçamento foi contratado?</p>
            {options.map((q) => (
              <button
                key={q.id}
                type="button"
                role="radio"
                aria-checked={chosen === q.id}
                onClick={() => setChosen(q.id)}
                className={cx("flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left ring-1 transition", chosen === q.id ? "bg-ok/10 ring-ok" : "ring-line-strong hover:bg-bg-2")}
              >
                <span className={cx("grid size-5 shrink-0 place-items-center rounded-full ring-2", chosen === q.id ? "bg-ok text-white ring-ok" : "ring-line-strong")}>{chosen === q.id && <Check className="size-3" />}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{q.supplier}</span>
                {q.id === cheapestId && <span className="text-[11px] font-medium text-ok">menor preço</span>}
                {q.status === "approved" && <span className="text-[11px] font-medium text-ok">já aprovado</span>}
                <span className="shrink-0 text-sm font-semibold tabular-nums">{fmtBRL(q.amountCents)}</span>
              </button>
            ))}
            <button
              type="button"
              role="radio"
              aria-checked={chosen === ""}
              onClick={() => setChosen("")}
              className={cx("flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left ring-1 transition", chosen === "" ? "bg-bg-2 ring-fg-2" : "ring-line-strong hover:bg-bg-2")}
            >
              <CircleSlash className="size-5 shrink-0 text-muted" />
              <span className="text-sm">Encerrar sem contratar</span>
            </button>
          </div>
          {pick && cheapestId && pick.id !== cheapestId && <p className="rounded-xl bg-warn/10 px-3 py-2 text-xs text-fg-2 ring-1 ring-inset ring-warn/15">Não é o menor preço. Vale escrever o motivo da escolha (vai para o histórico e para o relatório).</p>}
          <Textarea name="note" rows={3} maxLength={1000} required={!chosen} placeholder={chosen ? "Observação (opcional): ex.: melhor garantia, começa em novembro" : "Motivo (obrigatório): ex.: serviço adiado para 2027"} />
          {others > 0 && (
            <label className="flex items-start gap-3 rounded-xl px-3 py-2.5 ring-1 ring-line">
              <input type="checkbox" name="rejectOthers" defaultChecked className="mt-0.5 size-4 accent-[var(--brand)]" />
              <span className="text-sm">
                Recusar {others === 1 ? "o orçamento que ainda aguarda" : `os ${others} orçamentos que ainda aguardam`}
                <span className="block text-xs text-muted">Quem cadastrou cada um recebe o aviso com o motivo.</span>
              </span>
            </label>
          )}
          {state?.error && <Alert>{state.error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Voltar</Button>
            <SubmitButton pending={pending} variant={chosen ? "success" : "brand"}>{chosen ? "Contratar e encerrar" : "Encerrar sem contratar"}</SubmitButton>
          </div>
        </form>
      </Sheet>
    </>
  );
}

/** Nova cotação (vazia, para pedir os orçamentos depois) ou renomear a atual. */
export function GroupNameButton({ group, compact }: { group?: { id: string; title: string; description: string | null }; compact?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, form, pending] = useFormSubmit(async (prev: SupplierState, f: FormData) => {
    const res = await saveGroup(group?.id ?? null, prev, f);
    if (res?.ok && res.id) {
      setOpen(false);
      if (group) router.refresh();
      else router.push(`/fornecedores/cotacao/${res.id}`);
    }
    return res;
  });
  return (
    <>
      {group ? (
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}><Pencil className="size-3.5" />Renomear</Button>
      ) : compact ? (
        <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"><FolderPlus className="size-3.5" />Nova cotação</button>
      ) : (
        <Button type="button" variant="outline" onClick={() => setOpen(true)}><FolderPlus className="size-4" />Nova cotação</Button>
      )}
      <Sheet open={open} onClose={() => !pending && setOpen(false)} title={group ? "Renomear cotação" : "Nova cotação"}>
        <form {...form} className="space-y-4">
          {!group && <p className="text-sm text-muted">Crie a cotação antes de ter os orçamentos (ex.: <b>Pintura da área externa</b>) e vá juntando os que chegarem.</p>}
          <Field label="Serviço ou material"><Input name="title" required minLength={2} maxLength={140} defaultValue={group?.title} placeholder="Ex.: Pintura da área externa" autoFocus /></Field>
          <Field label="Detalhes (opcional)" hint="O que precisa ser feito, medidas, prazo desejado…"><Textarea name="description" rows={3} maxLength={2000} defaultValue={group?.description ?? ""} /></Field>
          {state?.error && <Alert>{state.error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Cancelar</Button>
            <SubmitButton pending={pending}>{group ? "Salvar" : "Criar cotação"}</SubmitButton>
          </div>
        </form>
      </Sheet>
    </>
  );
}
