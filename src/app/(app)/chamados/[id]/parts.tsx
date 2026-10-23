"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, Send } from "lucide-react";
import { replyTicket, setTicketStatus, type TicketState } from "@/app/actions/tickets";
import { processImage } from "@/components/media-uploader";
import { useFormSubmit } from "@/components/use-form-submit";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Button, Textarea, buttonClass, type Variant } from "@/components/ui";

/** Caixa de resposta no fim da conversa (Ctrl/⌘ + Enter envia). */
export function ReplyForm({ id, hint }: { id: string; hint?: string }) {
  const [state, form, pending] = useFormSubmit<TicketState>(replyTicket.bind(null, id));
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) ref.current?.reset(); }, [state]);
  return (
    <form ref={ref} {...form} className="space-y-2">
      <Textarea
        name="body"
        rows={3}
        required
        minLength={2}
        maxLength={3000}
        placeholder="Escreva uma mensagem…"
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) ref.current?.requestSubmit(); }}
      />
      {state?.error && <Alert>{state.error}</Alert>}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted">{hint}</p>
        <SubmitButton pending={pending} size="sm"><Send className="size-4" />Enviar</SubmitButton>
      </div>
    </form>
  );
}

type StatusAction = "review" | "resolve" | "close" | "cancel" | "reopen";

/** Botão de mudança de situação. Com `note`, abre um campo para o motivo/comentário antes de confirmar. */
export function StatusButton({ id, action, label, icon, variant = "outline", note, confirmText }: {
  id: string; action: StatusAction; label: string; icon?: React.ReactNode; variant?: Variant;
  note?: { label: string; required?: boolean; placeholder?: string }; confirmText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, form, pending] = useFormSubmit<TicketState>(setTicketStatus.bind(null, id, action));
  if (!note) {
    return (
      <form {...form} onSubmit={(e) => { if (confirmText && !confirm(confirmText)) return e.preventDefault(); form.onSubmit(e); }}>
        <SubmitButton pending={pending} variant={variant} className="w-full">{icon}{label}</SubmitButton>
        {state?.error && <div className="mt-2"><Alert>{state.error}</Alert></div>}
      </form>
    );
  }
  if (!open) return <Button type="button" variant={variant} className="w-full" onClick={() => setOpen(true)}>{icon}{label}</Button>;
  return (
    <form {...form} className="space-y-2 rounded-2xl bg-bg-2 p-3">
      <p className="text-sm font-medium">{note.label}</p>
      <Textarea name="note" rows={3} autoFocus required={note.required} minLength={note.required ? 5 : undefined} maxLength={1000} placeholder={note.placeholder} />
      {state?.error && <Alert>{state.error}</Alert>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className={buttonClass("ghost", "sm")}>Voltar</button>
        <SubmitButton pending={pending} size="sm" variant={variant === "outline" ? "brand" : variant}>Confirmar</SubmitButton>
      </div>
    </form>
  );
}

/** Mais fotos depois de aberto (quem abriu, até encerrar). */
export function AddPhotos({ id, remaining }: { id: string; remaining: number }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function send(list: FileList | null) {
    const files = Array.from(list ?? []).filter((f) => f.type.startsWith("image/")).slice(0, remaining);
    setError(null);
    for (const [i, f] of files.entries()) {
      setBusy(`Enviando ${i + 1}/${files.length}…`);
      const blob = await processImage(f).catch(() => f);
      const body = new FormData();
      body.append("file", new File([blob], "foto.jpg", { type: blob.type || "image/jpeg" }));
      const res = await fetch(`/api/chamados/${id}/fotos`, { method: "POST", body }).catch(() => null);
      if (!res?.ok) setError(((await res?.json().catch(() => null)) as { error?: string } | null)?.error ?? "Uma foto não foi enviada.");
    }
    setBusy(null);
    router.refresh();
  }
  return (
    <div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => { send(e.target.files); e.target.value = ""; }} />
      <Button type="button" variant="outline" size="sm" disabled={!!busy} onClick={() => input.current?.click()}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}{busy ?? "Adicionar fotos"}
      </Button>
      {error && <div className="mt-2"><Alert>{error}</Alert></div>}
    </div>
  );
}
