"use client";

import { useActionState, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Paperclip, X } from "lucide-react";
import { createFinanceEntry, updateFinanceEntry, type FinanceState } from "@/app/actions/finance";
import { ATTACHMENT_KINDS, FIN_CATEGORIES, FIN_STATUS, FIN_TYPES, MAX_ATTACHMENT_BYTES, PAYMENT_METHODS, type AttachmentKind, type FinType } from "@/lib/finance";
import { Alert, Field, Input, Select, Textarea, buttonClass, cx } from "@/components/ui";
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
  const router = useRouter();
  const [editState, action] = useActionState(updateFinanceEntry, undefined);
  const [type, setType] = useState<FinType>(initial.type);
  const [status, setStatus] = useState(initial.status);
  const listId = `fin-cat-${type}`;
  // Novo lançamento: anexos escolhidos antes de criar, enviados logo depois
  const [files, setFiles] = useState<Picked[]>([]);
  const [newState, setNewState] = useState<(NonNullable<FinanceState> & { created?: string; failed?: string[] }) | undefined>(undefined);
  const [sending, setSending] = useState<string | null>(null);
  const state = editing ? editState : newState;

  async function submitNew(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (sending) return;
    const fd = new FormData(e.currentTarget);
    fd.set("stay", "1");
    setNewState(undefined);
    setSending("Salvando…");
    const res = await createFinanceEntry(undefined, fd).catch(() => ({ error: "Não foi possível salvar. Tente de novo." }) as FinanceState);
    if (!res?.id) {
      setNewState(res);
      setSending(null);
      return;
    }
    const failed: string[] = [];
    for (const [i, f] of files.entries()) {
      setSending(`Enviando anexo ${i + 1} de ${files.length}…`);
      const up = new FormData();
      up.append("file", f.file);
      up.append("kind", f.kind);
      const r = await fetch(`/api/financeiro/${res.id}/anexos`, { method: "POST", body: up }).catch(() => null);
      if (!r?.ok) failed.push(`${f.file.name}: ${(await r?.json().catch(() => null))?.error ?? "falha no envio."}`);
    }
    if (!failed.length) {
      router.push(`/financeiro/${res.id}`);
      return;
    }
    setSending(null);
    setFiles([]);
    setNewState({ created: res.id, failed });
  }

  if (newState?.created) {
    return (
      <div className="space-y-4">
        <Alert tone="ok">Lançamento criado, mas alguns anexos não foram enviados:</Alert>
        <ul className="space-y-1 text-sm text-bad">{newState.failed?.map((f) => <li key={f}>• {f}</li>)}</ul>
        <Link href={`/financeiro/${newState.created}`} className={buttonClass("brand")}>Abrir o lançamento e anexar de novo</Link>
      </div>
    );
  }

  return (
    <form action={editing ? action : undefined} onSubmit={editing ? undefined : submitNew} className="space-y-5">
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

      {!editing && <PickAttachments files={files} onChange={setFiles} defaultKind={type === "expense" ? "invoice" : "receipt"} />}

      {state?.error && <Alert>{state.error}</Alert>}
      {state?.ok && <Alert tone="ok">{state.message}</Alert>}
      <div className="flex flex-wrap gap-2">
        {editing ? (
          <SubmitButton pendingText="Salvando…">Salvar alterações</SubmitButton>
        ) : (
          <SubmitButton pending={!!sending} pendingText={sending ?? undefined}>Criar lançamento</SubmitButton>
        )}
        {onDone && <button type="button" onClick={onDone} className="inline-flex h-10 items-center rounded-xl px-4 text-sm font-medium text-fg-2 hover:bg-bg-2">Fechar</button>}
      </div>
    </form>
  );
}

type Picked = { id: number; file: File; kind: AttachmentKind };
let seq = 0;
const ACCEPT = "application/pdf,image/jpeg,image/png,image/webp,.xml,application/xml,text/xml";

/** Escolha dos anexos do novo lançamento (nota fiscal, boleto, comprovante), cada um com o seu tipo. */
function PickAttachments({ files, onChange, defaultKind }: { files: Picked[]; onChange: (f: Picked[]) => void; defaultKind: AttachmentKind }) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  function add(list: FileList) {
    const big = Array.from(list).filter((f) => f.size > MAX_ATTACHMENT_BYTES);
    setError(big.length ? `${big.map((f) => f.name).join(", ")}: muito grande (máx. 4 MB cada).` : null);
    const ok = Array.from(list).filter((f) => f.size <= MAX_ATTACHMENT_BYTES);
    onChange([...files, ...ok.map((file) => ({ id: ++seq, file, kind: defaultKind }))]);
    if (input.current) input.current.value = "";
  }

  return (
    <div className="space-y-2">
      <p className="text-[13px] font-medium text-fg-2">Anexos</p>
      {files.length > 0 && (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {files.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <FileText className="size-4 shrink-0 text-muted" />
              <span className="min-w-0 flex-1 truncate text-sm">{f.file.name}</span>
              <span className="text-xs text-muted">{(f.file.size / 1024 / 1024).toFixed(1).replace(".", ",")} MB</span>
              <Select
                value={f.kind}
                onChange={(e) => onChange(files.map((x) => (x.id === f.id ? { ...x, kind: e.target.value as AttachmentKind } : x)))}
                className="h-8 w-auto py-0 text-xs"
                aria-label="Tipo do anexo"
              >
                {Object.entries(ATTACHMENT_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </Select>
              <button type="button" onClick={() => onChange(files.filter((x) => x.id !== f.id))} className="rounded-lg p-1 text-muted hover:bg-bg-2 hover:text-bad" aria-label={`Remover ${f.file.name}`}>
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <input ref={input} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => e.target.files?.length && add(e.target.files)} />
      <button type="button" onClick={() => input.current?.click()} className={buttonClass("outline", "sm")}>
        <Paperclip className="size-3.5" />Anexar nota fiscal, boleto ou comprovante
      </button>
      <p className="text-xs text-muted">PDF, foto (JPG, PNG, WEBP) ou o XML da NF-e, até 4 MB cada. Os arquivos são enviados ao criar o lançamento.</p>
      {error && <p className="text-xs text-bad">{error}</p>}
    </div>
  );
}
