"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Upload } from "lucide-react";
import { ATTACHMENT_KINDS, MAX_ATTACHMENT_BYTES } from "@/lib/finance";
import { Select, buttonClass, cx } from "@/components/ui";
import { EntryForm, type EntryInitial } from "../entry-form";

/** Botão "Editar" que abre o formulário no lugar. */
export function EditEntry({ initial, today }: { initial: EntryInitial; today: string }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={buttonClass("outline", "sm")}>
        <Pencil className="size-3.5" />Editar
      </button>
    );
  }
  return (
    <div className="basis-full rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <EntryForm initial={initial} today={today} onDone={() => setOpen(false)} />
    </div>
  );
}

/** Botão de envio com confirmação (excluir, remover anexo). */
export function ConfirmSubmit({ message, className, children }: { message: string; className?: string; children: React.ReactNode }) {
  return (
    <button type="submit" className={className} onClick={(e) => { if (!confirm(message)) e.preventDefault(); }}>
      {children}
    </button>
  );
}

/** Envio de notas fiscais, boletos e comprovantes (um arquivo por vez, vários em sequência). */
export function AttachmentUploader({ entryId }: { entryId: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState("invoice");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send(files: FileList) {
    setError(null);
    for (const file of Array.from(files)) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setError(`${file.name}: arquivo muito grande (máx. 4 MB).`);
        continue;
      }
      setBusy(file.name);
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", kind);
      const res = await fetch(`/api/financeiro/${entryId}/anexos`, { method: "POST", body: fd }).catch(() => null);
      const data = await res?.json().catch(() => ({}));
      if (!res?.ok) setError(`${file.name}: ${data?.error ?? "falha no envio."}`);
    }
    setBusy(null);
    if (input.current) input.current.value = "";
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={kind} onChange={(e) => setKind(e.target.value)} className="w-auto" aria-label="Tipo do anexo">
          {Object.entries(ATTACHMENT_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
        <input ref={input} type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp,.xml,application/xml,text/xml" className="hidden" onChange={(e) => e.target.files?.length && send(e.target.files)} />
        <button type="button" disabled={!!busy} onClick={() => input.current?.click()} className={cx(buttonClass("brand", "sm"))}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
          {busy ? `Enviando ${busy.length > 24 ? busy.slice(0, 24) + "…" : busy}` : "Anexar arquivo"}
        </button>
      </div>
      <p className="text-xs text-muted">PDF, foto (JPG, PNG, WEBP) ou o XML da NF-e, até 4 MB cada.</p>
      {error && <p className="text-xs text-bad">{error}</p>}
    </div>
  );
}
