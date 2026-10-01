"use client";

import { useActionState, useState } from "react";
import { createFinanceEntry, updateFinanceEntry } from "@/app/actions/finance";
import { FIN_CATEGORIES, FIN_STATUS, FIN_TYPES, PAYMENT_METHODS, type FinType } from "@/lib/finance";
import { Alert, Field, Input, Select, Textarea, cx } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export type EntryInitial = {
  id?: string;
  type: FinType;
  category: string;
  description: string;
  counterparty: string;
  document: string;
  amount: string;
  date: string;
  dueDate: string;
  paidAt: string;
  status: string;
  paymentMethod: string;
  notes: string;
};

/** Novo lançamento (sem id) ou edição (com id). */
export function EntryForm({ initial, condominiumId, today, onDone }: { initial: EntryInitial; condominiumId?: string; today: string; onDone?: () => void }) {
  const editing = !!initial.id;
  const [state, action] = useActionState(editing ? updateFinanceEntry : createFinanceEntry, undefined);
  const [type, setType] = useState<FinType>(initial.type);
  const [status, setStatus] = useState(initial.status);
  const listId = `fin-cat-${type}`;

  return (
    <form action={action} className="space-y-5">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      {condominiumId && <input type="hidden" name="condominiumId" value={condominiumId} />}
      <input type="hidden" name="type" value={type} />

      <div className="inline-flex rounded-xl bg-bg-2 p-1">
        {(Object.keys(FIN_TYPES) as FinType[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setType(k)}
            className={cx("rounded-lg px-4 py-1.5 text-sm font-medium transition", type === k ? (k === "income" ? "bg-surface text-ok shadow-card" : "bg-surface text-bad shadow-card") : "text-muted hover:text-fg")}
          >
            {FIN_TYPES[k]}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Descrição" className="sm:col-span-2">
          <Input name="description" required maxLength={200} defaultValue={initial.description} placeholder={type === "expense" ? "Ex.: Manutenção mensal dos elevadores" : "Ex.: Taxa condominial de outubro"} />
        </Field>
        <Field label="Valor (R$)">
          <Input name="amount" required inputMode="decimal" defaultValue={initial.amount} placeholder="0,00" className="font-num tabular-nums" />
        </Field>
        <Field label="Categoria" hint="Escolha uma sugestão ou escreva outra.">
          <Input name="category" required maxLength={60} list={listId} defaultValue={initial.category} />
          <datalist id={listId}>{FIN_CATEGORIES[type].map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        <Field label={type === "expense" ? "Fornecedor" : "Pagador"}>
          <Input name="counterparty" maxLength={120} defaultValue={initial.counterparty} placeholder={type === "expense" ? "Empresa ou prestador" : "Unidade, pessoa ou empresa"} />
        </Field>
        <Field label="Nº da nota fiscal / documento">
          <Input name="document" maxLength={60} defaultValue={initial.document} placeholder="Ex.: NF 000123" />
        </Field>
        <Field label="Competência" hint="Mês a que o lançamento pertence.">
          <Input type="date" name="date" required defaultValue={initial.date || today} />
        </Field>
        <Field label="Vencimento">
          <Input type="date" name="dueDate" defaultValue={initial.dueDate} />
        </Field>
        <Field label="Situação">
          <Select name="status" value={status} onChange={(e) => setStatus(e.target.value)}>
            {Object.entries(FIN_STATUS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
          </Select>
        </Field>
        {status === "paid" && (
          <Field label={type === "expense" ? "Data do pagamento" : "Data do recebimento"}>
            <Input type="date" name="paidAt" required defaultValue={initial.paidAt || today} />
          </Field>
        )}
        <Field label="Forma de pagamento">
          <Select name="paymentMethod" defaultValue={initial.paymentMethod}>
            <option value="">—</option>
            {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </Select>
        </Field>
        <Field label="Observações" className="sm:col-span-2">
          <Textarea name="notes" rows={3} maxLength={2000} defaultValue={initial.notes} />
        </Field>
      </div>

      {state?.error && <Alert>{state.error}</Alert>}
      {state?.ok && <Alert tone="ok">{state.message}</Alert>}
      <div className="flex flex-wrap gap-2">
        <SubmitButton pendingText="Salvando…">{editing ? "Salvar alterações" : "Criar lançamento"}</SubmitButton>
        {onDone && <button type="button" onClick={onDone} className="inline-flex h-10 items-center rounded-xl px-4 text-sm font-medium text-fg-2 hover:bg-bg-2">Fechar</button>}
      </div>
      {!editing && <p className="text-xs text-muted">Depois de criar, você anexa a nota fiscal, o boleto ou o comprovante.</p>}
    </form>
  );
}
