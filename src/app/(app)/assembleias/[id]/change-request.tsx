"use client";

import { useState, useTransition } from "react";
import { GitPullRequestArrow, Loader2 } from "lucide-react";
import { cancelAssemblyChange, decideAssemblyChange, requestAssemblyDelete, type AssemblyState } from "@/app/actions/assembly";
import { useFormSubmit } from "@/components/use-form-submit";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Button, Field, Textarea } from "@/components/ui";

type Pending = { id: string; kind: string; reason: string; requestedBy: string; createdAt: string; lines: string[]; resetItems: number };

/** Pedido do superadmin aguardando o síndico: o síndico decide; o superadmin pode cancelar. */
export function ChangeRequestPanel({ pending: pending_, canDecide, canCancel }: { pending: Pending; canDecide: boolean; canCancel: boolean }) {
  const p = pending_;
  const [state, form, pending] = useFormSubmit((prev: AssemblyState, f: FormData) => decideAssemblyChange(pending_.id, prev, f));
  const [cancelling, start] = useTransition();
  const del = p.kind === "delete";

  return (
    <div className="space-y-4 rounded-2xl bg-warn/10 p-5 ring-1 ring-inset ring-warn/20">
      <div className="flex items-start gap-3">
        <GitPullRequestArrow className="mt-0.5 size-5 shrink-0 text-warn" />
        <div className="min-w-0 space-y-1">
          <p className="font-medium">
            {p.requestedBy} pediu para {del ? "excluir esta assembleia" : "alterar esta assembleia"}
            <span className="ml-2 text-xs font-normal text-muted">{new Date(p.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span>
          </p>
          {p.reason && <p className="text-sm text-fg-2">Motivo: “{p.reason}”</p>}
          {del ? (
            <p className="text-sm text-fg-2">Se aprovado, a assembleia, a pauta, os votos e a ata são apagados. A exclusão fica registrada na auditoria.</p>
          ) : (
            <ul className="list-disc space-y-0.5 pl-5 text-sm text-fg-2">{p.lines.map((l) => <li key={l}>{l}</li>)}</ul>
          )}
          {!del && p.resetItems > 0 && <p className="text-sm font-medium text-warn">{p.resetItems} {p.resetItems === 1 ? "item terá" : "itens terão"} os votos zerados, e todos serão avisados para votar de novo.</p>}
          {!canDecide && <p className="text-xs text-muted">Aguardando a aprovação do síndico. Nada muda até lá.</p>}
        </div>
      </div>

      {canDecide && (
        <form
          {...form}
          onSubmit={(e) => {
            const approve = ((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value === "approve";
            if (del && approve && !confirm("Aprovar a exclusão? A assembleia e os votos serão apagados.")) return e.preventDefault();
            form.onSubmit(e);
          }}
          className="space-y-3"
        >
          <Field label="Comentário (opcional)">
            <Textarea name="note" rows={2} maxLength={500} placeholder="Ex.: ok, data remarcada na reunião do conselho." />
          </Field>
          <div className="flex flex-wrap gap-2">
            <SubmitButton pending={pending} name="decision" value="approve" variant={del ? "danger" : "brand"}>{del ? "Aprovar exclusão" : "Aprovar alteração"}</SubmitButton>
            <SubmitButton pending={pending} name="decision" value="reject" variant="outline">Recusar</SubmitButton>
          </div>
        </form>
      )}
      {canCancel && (
        <Button variant="ghost" size="sm" disabled={cancelling} onClick={() => start(() => cancelAssemblyChange(p.id))}>
          {cancelling && <Loader2 className="size-4 animate-spin" />}Cancelar pedido
        </Button>
      )}
      {state?.error && <Alert>{state.error}</Alert>}
      {state?.message && <Alert tone="ok">{state.message}</Alert>}
    </div>
  );
}

/** Superadmin: pedir a exclusão de uma assembleia publicada (com motivo para o síndico). */
export function RequestDelete({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [state, form, pending] = useFormSubmit((p: AssemblyState, f: FormData) => requestAssemblyDelete(id, p, f));
  if (!open) return <Button variant="danger" onClick={() => setOpen(true)}>Pedir exclusão</Button>;
  return (
    <form {...form} className="w-full space-y-3">
      <Field label="Motivo da exclusão" hint="O síndico precisa aprovar. Até lá, nada é apagado.">
        <Textarea name="reason" rows={2} required minLength={5} maxLength={500} />
      </Field>
      {state?.error && <Alert>{state.error}</Alert>}
      {state?.message && <Alert tone="ok">{state.message}</Alert>}
      <div className="flex gap-2">
        <SubmitButton pending={pending} pendingText="Enviando…" variant="danger">Enviar pedido ao síndico</SubmitButton>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
      </div>
    </form>
  );
}
