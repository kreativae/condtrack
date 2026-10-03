"use client";

import { useId, useState } from "react";
import { Copy, Plus, X } from "lucide-react";
import type { BudgetState } from "@/app/actions/budget";
import { useFormSubmit } from "@/components/use-form-submit";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Button, Input, buttonClass, cx } from "@/components/ui";
import { centsToInput, fmtBRL, parseBRL, type FinType } from "@/lib/finance";

type Line = { type: FinType; category: string; cents: number };
type Row = { key: number; type: FinType; category: string; amount: string };

let seq = 0;
const STARTER: Line[] = [
  ...["Folha de pagamento", "Encargos e impostos", "Água", "Energia", "Manutenção", "Limpeza", "Portaria e segurança", "Elevadores", "Seguros", "Administradora"].map((category) => ({ type: "expense" as const, category, cents: 0 })),
  ...["Taxa condominial", "Fundo de reserva"].map((category) => ({ type: "income" as const, category, cents: 0 })),
];
const toRows = (l: Line[]) => l.map((x) => ({ key: ++seq, type: x.type, category: x.category, amount: x.cents ? centsToInput(x.cents) : "" }));

export function BudgetEditor({ action, year, initial, previousBudget, previousRealized, suggestions }: {
  action: (s: BudgetState, f: FormData) => Promise<BudgetState>;
  year: number;
  initial: Line[];
  previousBudget: Line[];
  previousRealized: Line[];
  suggestions: Record<FinType, string[]>;
}) {
  const [state, form, pending] = useFormSubmit(action);
  // Orçamento novo: já traz as categorias mais comuns, só para preencher o valor
  const [rows, setRows] = useState<Row[]>(() => toRows(initial.length ? initial : STARTER));
  const [adjust, setAdjust] = useState("0");
  const listId = useId();

  // Preenche a partir do ano anterior, com reajuste (%) e arredondado a R$ 10
  const fill = (src: Line[]) => {
    const f = 1 + (Number(adjust.replace(",", ".")) || 0) / 100;
    if (rows.some((r) => r.amount) && !confirm("Substituir os valores preenchidos?")) return;
    setRows(toRows(src.filter((x) => x.cents > 0).map((x) => ({ ...x, cents: Math.round((x.cents * f) / 1000) * 1000 }))));
  };
  const add = (type: FinType) => setRows((r) => [...r, { key: ++seq, type, category: "", amount: "" }]);
  const set = (key: number, patch: Partial<Row>) => setRows((r) => r.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const total = (type: FinType) => rows.filter((r) => r.type === type).reduce((s, r) => s + (parseBRL(r.amount) ?? 0), 0);

  return (
    <form {...form} className="space-y-6">
      {(previousBudget.length > 0 || previousRealized.length > 0) && (
        <div className="flex flex-wrap items-end gap-2 rounded-2xl bg-bg-2 p-4">
          <label className="text-xs text-muted">
            Reajuste
            <span className="mt-1 flex items-center gap-1">
              <Input value={adjust} onChange={(e) => setAdjust(e.target.value)} inputMode="decimal" className="h-8 w-20 text-right text-xs" />%
            </span>
          </label>
          {previousBudget.length > 0 && (
            <button type="button" onClick={() => fill(previousBudget)} className={buttonClass("outline", "sm")}><Copy className="size-4" />Copiar orçamento de {year - 1}</button>
          )}
          {previousRealized.length > 0 && (
            <button type="button" onClick={() => fill(previousRealized)} className={buttonClass("outline", "sm")}><Copy className="size-4" />Usar o realizado de {year - 1}</button>
          )}
        </div>
      )}

      {(["expense", "income"] as FinType[]).map((type) => (
        <section key={type}>
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h2 className="font-display text-lg font-semibold">{type === "income" ? "Receitas" : "Despesas"}</h2>
            <span className="font-num text-sm text-muted">Total: {fmtBRL(total(type))}</span>
          </div>
          <datalist id={`${listId}-${type}`}>{suggestions[type].map((c) => <option key={c} value={c} />)}</datalist>
          <ul className="space-y-2">
            {rows.filter((r) => r.type === type).map((r) => (
              <li key={r.key} className="flex gap-2">
                <input type="hidden" name="type" value={r.type} />
                <Input name="category" value={r.category} onChange={(e) => set(r.key, { category: e.target.value })} list={`${listId}-${type}`} placeholder="Categoria" maxLength={60} className="flex-1" />
                <div className="relative w-36 shrink-0 sm:w-44">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted">R$</span>
                  <Input name="amount" value={r.amount} onChange={(e) => set(r.key, { amount: e.target.value })} inputMode="decimal" placeholder="0,00" className={cx("pl-9 text-right font-num", r.amount && parseBRL(r.amount) == null && "border-bad")} />
                </div>
                <button type="button" onClick={() => setRows((x) => x.filter((y) => y.key !== r.key))} aria-label="Remover" className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-bg-2 hover:text-bad"><X className="size-4" /></button>
              </li>
            ))}
          </ul>
          <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => add(type)}><Plus className="size-4" />Adicionar categoria</Button>
        </section>
      ))}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
        <p className="text-sm text-fg-2">Resultado orçado: <b className="font-num">{fmtBRL(total("income") - total("expense"))}</b></p>
        <SubmitButton pending={pending} pendingText="Salvando…">Salvar orçamento</SubmitButton>
      </div>
      {state?.error && <Alert>{state.error}</Alert>}
    </form>
  );
}
