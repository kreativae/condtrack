"use client";

import { useState, useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { cancelAnnouncementDelete, decideAnnouncementDelete, requestAnnouncementDelete, type AnnouncementChangeState } from "@/app/actions/announcements";
import { useFormSubmit } from "@/components/use-form-submit";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Button, Field, Textarea } from "@/components/ui";

/** Superadmin: pedir a exclusão do comunicado (o síndico aprova). */
export function RequestAnnouncementDelete({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [state, form, pending] = useFormSubmit((p: AnnouncementChangeState, f: FormData) => requestAnnouncementDelete(id, p, f));
  if (!open) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} className="text-bad hover:bg-bad/10">
        <Trash2 className="size-3.5" />Pedir exclusão
      </Button>
    );
  }
  return (
    <form {...form} className="mt-3 w-full space-y-3">
      <Field label="Motivo da exclusão" hint="O síndico precisa aprovar. Até lá, o comunicado continua publicado.">
        <Textarea name="reason" rows={2} required minLength={5} maxLength={500} />
      </Field>
      {state?.error && <Alert>{state.error}</Alert>}
      <div className="flex gap-2">
        <SubmitButton pending={pending} pendingText="Enviando…" variant="danger" size="sm">Enviar pedido ao síndico</SubmitButton>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancelar</Button>
      </div>
    </form>
  );
}

type Pending = { id: string; reason: string; requestedBy: string; createdAt: string };

/** Pedido aguardando: o síndico aprova ou recusa; o superadmin pode cancelar. */
export function AnnouncementDeletePanel({ pending: p, canDecide, canCancel }: { pending: Pending; canDecide: boolean; canCancel: boolean }) {
  const [state, form, pending] = useFormSubmit((prev: AnnouncementChangeState, f: FormData) => decideAnnouncementDelete(p.id, prev, f));
  const [cancelling, start] = useTransition();
  return (
    <div className="mt-4 space-y-3 rounded-xl bg-warn/10 p-4 text-sm ring-1 ring-inset ring-warn/20">
      <p className="font-medium text-fg">
        {p.requestedBy} pediu para excluir este comunicado
        <span className="ml-2 text-xs font-normal text-muted">{new Date(p.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span>
      </p>
      {p.reason && <p className="text-fg-2">Motivo: “{p.reason}”</p>}
      {!canDecide && <p className="text-xs text-muted">Aguardando a aprovação do síndico.</p>}
      {canDecide && (
        <form
          {...form}
          onSubmit={(e) => {
            const approve = ((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value === "approve";
            if (approve && !confirm("Aprovar a exclusão? O comunicado será apagado para todos.")) return e.preventDefault();
            form.onSubmit(e);
          }}
          className="space-y-3"
        >
          <Textarea name="note" rows={2} maxLength={500} placeholder="Comentário (opcional)" />
          <div className="flex flex-wrap gap-2">
            <SubmitButton pending={pending} name="decision" value="approve" variant="danger" size="sm">Aprovar exclusão</SubmitButton>
            <SubmitButton pending={pending} name="decision" value="reject" variant="outline" size="sm">Recusar</SubmitButton>
          </div>
        </form>
      )}
      {canCancel && (
        <Button variant="ghost" size="sm" disabled={cancelling} onClick={() => start(() => cancelAnnouncementDelete(p.id))}>
          {cancelling && <Loader2 className="size-4 animate-spin" />}Cancelar pedido
        </Button>
      )}
      {state?.error && <Alert>{state.error}</Alert>}
    </div>
  );
}
