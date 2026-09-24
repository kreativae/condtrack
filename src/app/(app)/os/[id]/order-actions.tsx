"use client";

import { useEffect, useRef, useState } from "react";
import { useFormSubmit } from "@/components/use-form-submit";
import { Star } from "lucide-react";
import clsx from "clsx";
import type { ActionState } from "@/app/actions/orders";
import { Alert, Field, Input, Select, Textarea, Button } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

type Action = (state: ActionState, form: FormData) => Promise<ActionState>;

function useFormAction(action: Action) {
  const [state, form, pending] = useFormSubmit(action);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return { state, form, pending, ref };
}

export function AssignForm({ action, providers, defaultDue, currentId }: { action: Action; providers: { id: string; name: string; company: string | null; specialty: string | null }[]; defaultDue?: string; currentId?: string | null }) {
  const { state, form, pending, ref } = useFormAction(action);
  return (
    <form ref={ref} {...form} className="space-y-3">
      <Field label="Prestador">
        <Select name="providerId" defaultValue={currentId ?? ""} required>
          <option value="" disabled>Selecione…</option>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.company ? ` · ${p.company}` : ""}
              {p.specialty ? ` (${p.specialty})` : ""}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Prazo">
        <Input type="date" name="dueDate" defaultValue={defaultDue} />
      </Field>
      <Field label="Instruções (opcional)">
        <Textarea name="comment" rows={2} placeholder="Horário de acesso, contato no local…" />
      </Field>
      {state?.error && <Alert>{state.error}</Alert>}
      <SubmitButton pending={pending} className="w-full">{currentId ? "Reatribuir" : "Atribuir prestador"}</SubmitButton>
    </form>
  );
}

export function TransitionForm({
  action, label, variant = "brand", commentLabel, requireComment, placeholder, hint,
}: { action: Action; label: string; variant?: "brand" | "outline" | "danger" | "success"; commentLabel?: string; requireComment?: boolean; placeholder?: string; hint?: string }) {
  const { state, form, pending, ref } = useFormAction(action);
  return (
    <form ref={ref} {...form} className="space-y-3">
      {commentLabel && (
        <Field label={commentLabel} hint={hint}>
          <Textarea name="comment" rows={3} required={requireComment} minLength={requireComment ? 5 : undefined} placeholder={placeholder} />
        </Field>
      )}
      {state?.error && <Alert>{state.error}</Alert>}
      <SubmitButton pending={pending} variant={variant} className="w-full">{label}</SubmitButton>
    </form>
  );
}

/** Validar ou devolver — mesmo comentário, duas saídas. */
export function DecisionForm({ approve, reject, approveLabel, rejectLabel, title }: { approve: Action; reject: Action; approveLabel: string; rejectLabel: string; title: string }) {
  const [mode, setMode] = useState<"approve" | "reject">("approve");
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-bg-2 p-1 text-xs">
        {(["approve", "reject"] as const).map((m) => (
          <button key={m} type="button" onClick={() => setMode(m)} className={clsx("rounded-lg py-2 font-medium transition", mode === m ? (m === "approve" ? "bg-ok/15 text-ok" : "bg-bad/15 text-bad") : "text-muted")}>
            {m === "approve" ? approveLabel : rejectLabel}
          </button>
        ))}
      </div>
      {mode === "approve" ? (
        <DecisionPane key="a" action={approve} title={title} label={approveLabel} negative={false} />
      ) : (
        <DecisionPane key="r" action={reject} title={title} label={rejectLabel} negative />
      )}
    </div>
  );
}

function DecisionPane({ action, title, label, negative }: { action: Action; title: string; label: string; negative: boolean }) {
  const { state, form, pending, ref } = useFormAction(action);
  return (
    <form ref={ref} {...form} className="space-y-3">
      <Field label={title} hint={negative ? "Obrigatório: explique o que precisa ser ajustado." : undefined}>
        <Textarea name="comment" rows={3} required={negative} minLength={negative ? 5 : undefined} placeholder={negative ? "O que precisa ser refeito?" : "Comentário (opcional)"} />
      </Field>
      {state?.error && <Alert>{state.error}</Alert>}
      <SubmitButton pending={pending} variant={negative ? "danger" : "success"} className="w-full">{label}</SubmitButton>
    </form>
  );
}

export function CompleteForm({ action, disabled }: { action: Action; disabled?: boolean }) {
  const { state, form, pending, ref } = useFormAction(action);
  return (
    <form ref={ref} {...form} className="space-y-3">
      <Field label="Serviço realizado">
        <Textarea name="serviceReport" rows={3} required minLength={10} placeholder="Descreva o que foi feito…" />
      </Field>
      <Field label="Tempo de execução (min)">
        <Input type="number" name="executionMinutes" min={1} inputMode="numeric" placeholder="90" />
      </Field>
      <Field label="Materiais utilizados" hint="Um por linha — ex.: Tinta acrílica 18L ; 2">
        <Textarea name="materials" rows={2} />
      </Field>
      {state?.error && <Alert>{state.error}</Alert>}
      <SubmitButton pending={pending} className="w-full" disabled={disabled}>Concluir e solicitar validação</SubmitButton>
      {disabled && <p className="text-center text-xs text-muted">Anexe as fotos do DEPOIS para concluir.</p>}
    </form>
  );
}

export function CommentForm({ action }: { action: Action }) {
  const { state, form, pending, ref } = useFormAction(action);
  return (
    <form ref={ref} {...form} className="flex gap-2">
      <Input name="comment" placeholder="Escreva um comentário…" required className="flex-1" />
      <SubmitButton pending={pending} variant="outline">Enviar</SubmitButton>
      {state?.error && <p className="text-xs text-bad">{state.error}</p>}
    </form>
  );
}

export function RateForm({ action }: { action: Action }) {
  const { state, form, pending, ref } = useFormAction(action);
  const [value, setValue] = useState(0);
  return (
    <form ref={ref} {...form} className="space-y-3">
      <input type="hidden" name="rating" value={value} />
      <div className="flex justify-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" onClick={() => setValue(n)} aria-label={`${n} estrelas`}>
            <Star className={clsx("size-7 transition", n <= value ? "fill-brand text-brand" : "text-muted")} strokeWidth={1.4} />
          </button>
        ))}
      </div>
      <Textarea name="ratingComment" rows={2} placeholder="Conte como foi (opcional)" />
      {state?.error && <Alert>{state.error}</Alert>}
      <Button type="submit" disabled={!value || pending} className="w-full">{pending ? "Enviando…" : "Enviar avaliação"}</Button>
    </form>
  );
}
