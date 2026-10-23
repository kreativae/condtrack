"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, FileText, ImageIcon, Loader2, Paperclip, Trash2, X } from "lucide-react";
import { decideQuote, removeQuoteFile } from "@/app/actions/suppliers";
import { useFormSubmit } from "@/components/use-form-submit";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Button, Textarea } from "@/components/ui";
import { fmtSize } from "@/lib/finance";
import { QUOTE_FILE_TYPES } from "@/lib/suppliers";
import { pickQuoteFiles, uploadQuoteFiles } from "./quote-form";

type QFile = { id: string; fileName: string; mimeType: string; sizeBytes: number };

/** Arquivos do orçamento: abrir, baixar e, enquanto aguarda, anexar mais ou tirar. */
export function QuoteFiles({ quoteId, files, editable }: { quoteId: string; files: QFile[]; editable: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  async function add(list: FileList | null) {
    const { ok, bad } = pickQuoteFiles(list, files.length);
    setError(bad.length ? bad.join("; ") : null);
    if (!ok.length) return;
    setBusy(`Enviando (0/${ok.length})…`);
    const errors = await uploadQuoteFiles(quoteId, ok, (n) => setBusy(`Enviando (${n}/${ok.length})…`));
    setBusy(null);
    if (errors.length) setError(errors.join("; "));
    router.refresh();
  }

  return (
    <div className="space-y-2">
      {!files.length && <p className="text-sm text-muted">Nenhum arquivo anexado.</p>}
      {files.map((f) => {
        const Icon = f.mimeType === "application/pdf" ? FileText : ImageIcon;
        return (
          <div key={f.id} className="flex items-center gap-3 rounded-xl px-3 py-2 ring-1 ring-line">
            <Icon className="size-5 shrink-0 text-brand" />
            <a href={`/api/fornecedores/anexo/${f.id}`} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-sm font-medium hover:text-brand hover:underline">{f.fileName}</a>
            <span className="shrink-0 text-xs text-muted">{fmtSize(f.sizeBytes)}</span>
            <a href={`/api/fornecedores/anexo/${f.id}?baixar=1`} className="shrink-0 text-xs font-medium text-brand hover:underline">Baixar</a>
            {editable && (
              <button
                type="button"
                onClick={() => confirm(`Tirar "${f.fileName}" do orçamento?`) && start(async () => { await removeQuoteFile(f.id); router.refresh(); })}
                className="shrink-0 rounded-lg p-1 text-muted hover:bg-bg-2 hover:text-bad"
                aria-label="Tirar arquivo"
              >
                <Trash2 className="size-4" />
              </button>
            )}
          </div>
        );
      })}
      {editable && (
        <>
          <input ref={input} type="file" accept={Object.keys(QUOTE_FILE_TYPES).join(",")} multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
          <Button type="button" variant="outline" size="sm" disabled={!!busy} onClick={() => input.current?.click()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />}
            {busy ?? "Anexar PDF ou foto"}
          </Button>
        </>
      )}
      {error && <Alert>{error}</Alert>}
    </div>
  );
}

/** Decisão do síndico: aprovar (observação opcional) ou recusar (motivo obrigatório). */
export function DecidePanel({ quoteId, cheaperExists }: { quoteId: string; cheaperExists: boolean }) {
  const [state, form, pending] = useFormSubmit(decideQuote.bind(null, quoteId));
  const [mode, setMode] = useState<"approve" | "reject" | null>(null);
  if (state?.ok) return null;

  return (
    <div className="space-y-3">
      {!mode ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <Button type="button" variant="success" onClick={() => setMode("approve")}><Check className="size-4" />Aprovar</Button>
          <Button type="button" variant="danger" onClick={() => setMode("reject")}><X className="size-4" />Recusar</Button>
        </div>
      ) : (
        <form {...form} className="space-y-3">
          <input type="hidden" name="decision" value={mode} />
          {mode === "approve" && cheaperExists && (
            <p className="rounded-xl bg-warn/10 px-3 py-2 text-xs text-fg-2 ring-1 ring-inset ring-warn/15">Há um orçamento mais barato para este mesmo serviço. Se escolher este, vale explicar o motivo.</p>
          )}
          <Textarea
            name="note"
            rows={3}
            maxLength={1000}
            required={mode === "reject"}
            autoFocus
            placeholder={mode === "reject" ? "Motivo da recusa (vai para quem cadastrou)" : "Observação (opcional): ex.: aprovado com início em novembro"}
          />
          {state?.error && <Alert>{state.error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setMode(null)}>Voltar</Button>
            <SubmitButton pending={pending} variant={mode === "approve" ? "success" : "danger"}>
              {mode === "approve" ? "Confirmar aprovação" : "Confirmar recusa"}
            </SubmitButton>
          </div>
        </form>
      )}
    </div>
  );
}
