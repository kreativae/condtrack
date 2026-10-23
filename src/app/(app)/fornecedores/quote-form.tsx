"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Paperclip, Plus, X } from "lucide-react";
import type { SupplierState } from "@/app/actions/suppliers";
import { Alert, Button, Field, FieldGroup, Input, Select, Textarea } from "@/components/ui";
import { fmtSize } from "@/lib/finance";
import { MAX_QUOTE_FILES, MAX_QUOTE_FILE_BYTES, QUOTE_FILE_TYPES } from "@/lib/suppliers";

export type QuoteInitial = { title: string; description: string; amount: string; validUntil: string; deadline: string; paymentTerms: string };
const ACCEPT = Object.keys(QUOTE_FILE_TYPES).join(",");

/** Envia os arquivos um a um (cada um numa requisição, sem o limite das server actions). Devolve os erros. */
export async function uploadQuoteFiles(quoteId: string, files: File[], onStep?: (done: number) => void) {
  const errors: string[] = [];
  for (const [i, file] of files.entries()) {
    const body = new FormData();
    body.append("file", file);
    const res = await fetch(`/api/fornecedores/orcamento/${quoteId}/anexos`, { method: "POST", body }).catch(() => null);
    if (!res?.ok) errors.push(`${file.name}: ${((await res?.json().catch(() => null)) as { error?: string } | null)?.error ?? "não foi enviado"}`);
    onStep?.(i + 1);
  }
  return errors;
}

/** Confere tipo e tamanho antes de enviar (o servidor confere de novo). */
export function pickQuoteFiles(list: FileList | null, current: number) {
  const ok: File[] = [];
  const bad: string[] = [];
  for (const f of Array.from(list ?? [])) {
    if (!QUOTE_FILE_TYPES[f.type]) bad.push(`${f.name}: use PDF, JPG, PNG ou WEBP`);
    else if (f.size > MAX_QUOTE_FILE_BYTES) bad.push(`${f.name}: máx. 8 MB`);
    else if (current + ok.length >= MAX_QUOTE_FILES) bad.push(`${f.name}: no máximo ${MAX_QUOTE_FILES} arquivos`);
    else ok.push(f);
  }
  return { ok, bad };
}

export function QuoteForm({ action, initial, suppliers, supplierId, titles, isNew = !initial, group }: {
  action: (s: SupplierState, f: FormData) => Promise<SupplierState>;
  initial?: QuoteInitial;
  /** Lista para escolher (cadastro novo); vazio na edição */
  suppliers: { id: string; name: string; category: string | null }[];
  supplierId?: string;
  /** Cotações abertas: escrever o mesmo nome põe o orçamento nela */
  titles: string[];
  /** Cadastro (escolhe o fornecedor e anexa arquivos); `initial` pode vir só para preencher o serviço */
  isNew?: boolean;
  /** Cotação já definida (vindo da cotação, ou na edição): o serviço é o nome dela */
  group?: { id: string; title: string };
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setStep("Salvando…");
    const res: SupplierState = await action(undefined, new FormData(e.currentTarget)).catch(() => ({ error: "Não foi possível salvar. Tente de novo." }));
    if (!res?.ok || !res.id) {
      setError(res?.error ?? "Não foi possível salvar.");
      setStep(null);
      return;
    }
    const errors = files.length ? await uploadQuoteFiles(res.id, files, (n) => setStep(`Enviando arquivos (${n}/${files.length})…`)) : [];
    router.push(`/fornecedores/orcamento/${res.id}${errors.length ? "?falhou=" + errors.length : ""}`);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {isNew && (
        <FieldGroup label="Fornecedor">
          {suppliers.length ? (
            <div className="flex gap-2">
              <Select name="supplierId" required defaultValue={supplierId ?? ""} className="min-w-0 flex-1">
                <option value="" disabled>Escolha…</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}{s.category ? ` · ${s.category}` : ""}</option>)}
              </Select>
              <Link href="/fornecedores/novo" className="inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-brand ring-1 ring-line-strong hover:bg-bg-2"><Plus className="size-4" />Novo</Link>
            </div>
          ) : (
            <p className="text-sm text-muted">Nenhum fornecedor ainda. <Link href="/fornecedores/novo" className="font-medium text-brand hover:underline">Cadastre o primeiro</Link>.</p>
          )}
        </FieldGroup>
      )}

      <div className="grid gap-4 sm:grid-cols-[1.6fr_1fr]">
        {group ? (
          <FieldGroup label="Cotação">
            <input type="hidden" name="title" value={group.title} />
            {isNew && <input type="hidden" name="groupId" value={group.id} />}
            <p className="flex h-10 items-center truncate rounded-xl bg-bg-2 px-3.5 text-sm font-medium">{group.title}</p>
          </FieldGroup>
        ) : (
          <Field label="Cotação (serviço ou material)" hint="O nome de uma cotação aberta põe o orçamento nela; outro nome cria uma nova.">
            <Input name="title" required minLength={2} maxLength={140} list="quote-titles" defaultValue={initial?.title} placeholder="Ex.: Pintura da área externa" />
            <datalist id="quote-titles">{titles.map((t) => <option key={t} value={t} />)}</datalist>
          </Field>
        )}
        <Field label="Valor (R$)">
          <Input name="amount" required inputMode="decimal" defaultValue={initial?.amount} placeholder="0,00" className="tabular-nums" />
        </Field>
      </div>

      <Field label="O que está incluso">
        <Textarea name="description" rows={4} maxLength={3000} defaultValue={initial?.description} placeholder="Materiais, mão de obra, garantia…" />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Válido até">
          <Input name="validUntil" type="date" defaultValue={initial?.validUntil} />
        </Field>
        <Field label="Prazo de execução">
          <Input name="deadline" maxLength={80} defaultValue={initial?.deadline} placeholder="Ex.: 15 dias úteis" />
        </Field>
        <Field label="Pagamento">
          <Input name="paymentTerms" maxLength={120} defaultValue={initial?.paymentTerms} placeholder="Ex.: 50% na entrada + 50% na entrega" />
        </Field>
      </div>

      {isNew && (
        <FieldGroup label="Arquivos do orçamento" hint="PDF ou foto do orçamento, até 8 MB cada.">
          <div className="space-y-2">
            {files.map((f, i) => (
              <div key={i} className="flex items-center gap-2 rounded-xl bg-bg-2 px-3 py-2 text-sm">
                <Paperclip className="size-4 shrink-0 text-muted" />
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                <span className="text-xs text-muted">{fmtSize(f.size)}</span>
                <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} className="rounded-lg p-1 text-muted hover:bg-surface hover:text-bad" aria-label="Tirar"><X className="size-4" /></button>
              </div>
            ))}
            <input
              ref={input}
              type="file"
              accept={ACCEPT}
              multiple
              hidden
              onChange={(e) => {
                const { ok, bad } = pickQuoteFiles(e.target.files, files.length);
                setFiles([...files, ...ok]);
                setError(bad.length ? bad.join("; ") : null);
                e.target.value = "";
              }}
            />
            <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()}><Paperclip className="size-4" />Anexar PDF ou foto</Button>
          </div>
        </FieldGroup>
      )}

      {error && <Alert>{error}</Alert>}
      <div className="flex justify-end">
        <Button type="submit" disabled={!!step || (isNew && !suppliers.length)}>
          {step && <Loader2 className="size-4 animate-spin" />}
          {step ?? (isNew ? "Cadastrar orçamento" : "Salvar alterações")}
        </Button>
      </div>
    </form>
  );
}
