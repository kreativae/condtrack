"use client";

import { useFormSubmit } from "@/components/use-form-submit";
import { startTransition, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { adminUpdateOrder } from "@/app/actions/orders";
import { Alert, Field, Input, Select, Textarea, cx } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { PRIORITY_META, STATUSES, STATUS_META } from "@/lib/workflow";
import { toLocal } from "../responsibles-card";

const DATE_FIELDS = [
  ["createdAt", "Aberta em"],
  ["assignedAt", "Atribuída em"],
  ["startedAt", "Iniciada em"],
  ["completedAt", "Concluída em"],
  ["validatedAt", "Validada em"],
  ["approvedAt", "Aprovada em"],
] as const;
type DateKey = (typeof DATE_FIELDS)[number][0];

type Opt = { id: string; label: string };
type Order = {
  id: string;
  title: string;
  description: string;
  categoryId: string | null;
  priority: string;
  locationType: string;
  commonAreaId: string | null;
  unitId: string | null;
  locationNote: string | null;
  dueDate: string | null;
  assignedToId: string | null;
  status: string;
  serviceReport: string | null;
  executionMinutes: number | null;
  requestedById: string | null;
  validatedById: string | null;
  approvedById: string | null;
  materials: string;
  rating: number | null;
  ratingComment: string | null;
} & Record<DateKey, string | null>;

export function EditOrderForm({ order, categories, areas, units, providers, people }: { order: Order; categories: Opt[]; areas: Opt[]; units: Opt[]; providers: Opt[]; people: Opt[] }) {
  const router = useRouter();
  const [state, form, pending] = useFormSubmit(adminUpdateOrder.bind(null, order.id));
  const [loc, setLoc] = useState(order.locationType);
  const [status, setStatus] = useState(order.status);
  const [rating, setRating] = useState(order.rating ?? 0);

  // datetime-local vem no fuso do navegador: envia em ISO (UTC) para o servidor
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    for (const [k] of DATE_FIELDS) {
      const v = String(fd.get(k) ?? "");
      fd.set(k, v ? new Date(v).toISOString() : "");
    }
    startTransition(() => form.action(fd));
  }

  useEffect(() => {
    if (state?.ok) router.push(`/os/${order.id}`);
  }, [state, order.id, router]);

  return (
    <form action={form.action} onSubmit={onSubmit} className="space-y-8">
      <section className="space-y-5">
        <h2 className="font-display text-base font-semibold">Informações</h2>
        <Field label="Título"><Input name="title" defaultValue={order.title} required minLength={4} maxLength={120} /></Field>
        <Field label="Descrição"><Textarea name="description" defaultValue={order.description} required minLength={10} rows={5} /></Field>
        <div className="grid gap-5 sm:grid-cols-3">
          <Field label="Categoria">
            <Select name="categoryId" defaultValue={order.categoryId ?? ""}>
              <option value="">Sem categoria</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </Select>
          </Field>
          <Field label="Prioridade">
            <Select name="priority" defaultValue={order.priority}>
              {Object.entries(PRIORITY_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>
          </Field>
          <Field label="Prazo"><Input type="date" name="dueDate" defaultValue={order.dueDate ?? ""} /></Field>
        </div>
      </section>

      <section className="space-y-4 border-t border-line pt-6">
        <h2 className="font-display text-base font-semibold">Local</h2>
        <input type="hidden" name="locationType" value={loc} />
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-bg-2 p-1 text-sm sm:max-w-xs">
          {([["common_area", "Área comum"], ["unit", "Unidade"]] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setLoc(k)} className={cx("rounded-lg py-2 font-medium transition", loc === k ? "bg-surface text-brand shadow-card" : "text-muted")}>{l}</button>
          ))}
        </div>
        {loc === "common_area" ? (
          <Select name="commonAreaId" required defaultValue={order.commonAreaId ?? ""}>
            <option value="" disabled>Selecione a área…</option>
            {areas.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </Select>
        ) : (
          <Select name="unitId" required defaultValue={order.unitId ?? ""}>
            <option value="" disabled>Selecione a unidade…</option>
            {units.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
          </Select>
        )}
        <Input name="locationNote" defaultValue={order.locationNote ?? ""} placeholder="Complemento" maxLength={200} />
      </section>

      <section className="space-y-5 border-t border-line pt-6">
        <h2 className="font-display text-base font-semibold">Execução</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Prestador">
            <Select name="assignedToId" defaultValue={order.assignedToId ?? ""}>
              <option value="">Nenhum</option>
              {providers.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </Select>
          </Field>
          <Field label="Tempo de execução (min)"><Input type="number" name="executionMinutes" min={0} defaultValue={order.executionMinutes ?? ""} /></Field>
        </div>
        <Field label="Relatório do serviço"><Textarea name="serviceReport" defaultValue={order.serviceReport ?? ""} rows={3} /></Field>
        <Field label="Materiais usados" hint="Um por linha; quantidade depois de ponto e vírgula (ex.: Parafuso; 4 un)."><Textarea name="materials" defaultValue={order.materials} rows={3} /></Field>
      </section>

      <section className="space-y-5 border-t border-line pt-6">
        <h2 className="font-display text-base font-semibold">Pessoas e datas</h2>
        <div className="grid gap-5 sm:grid-cols-3">
          <Field label="Aberta por">
            <Select name="requestedById" required defaultValue={order.requestedById ?? ""}>
              <option value="" disabled>Selecione…</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </Select>
          </Field>
          <Field label="Validada por">
            <Select name="validatedById" defaultValue={order.validatedById ?? ""}>
              <option value="">Ninguém</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </Select>
          </Field>
          <Field label="Aprovada por">
            <Select name="approvedById" defaultValue={order.approvedById ?? ""}>
              <option value="">Ninguém</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </Select>
          </Field>
        </div>
        <div className="grid gap-5 sm:grid-cols-3">
          {DATE_FIELDS.map(([k, label]) => (
            <Field key={k} label={label}>
              <Input type="datetime-local" name={k} required={k === "createdAt"} defaultValue={toLocal(order[k])} />
            </Field>
          ))}
        </div>
        <p className="text-xs text-muted">Datas vazias de etapas exigidas pelo status são preenchidas com o momento atual ao trocar o status.</p>
      </section>

      <section className="space-y-5 border-t border-line pt-6">
        <h2 className="font-display text-base font-semibold">Avaliação do solicitante</h2>
        <input type="hidden" name="rating" value={rating || ""} />
        <div className="flex flex-wrap items-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" onClick={() => setRating(n === rating ? 0 : n)} aria-label={`${n} estrela(s)`} className="rounded-lg p-1 hover:bg-bg-2">
              <Star className={cx("size-6", n <= rating ? "fill-brand text-brand" : "text-muted")} strokeWidth={1.4} />
            </button>
          ))}
          <span className="ml-2 text-xs text-muted">{rating ? "Clique na mesma estrela para remover." : "Sem avaliação."}</span>
        </div>
        {rating > 0 && <Field label="Comentário da avaliação"><Textarea name="ratingComment" defaultValue={order.ratingComment ?? ""} rows={2} maxLength={1000} /></Field>}
      </section>

      <section className="space-y-5 border-t border-line pt-6">
        <h2 className="font-display text-base font-semibold">Status</h2>
        <Field label="Status da OS" hint="Alterar o status ignora o fluxo normal (antes/depois, validação). Marcos vazios são preenchidos automaticamente.">
          <Select name="status" value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
          </Select>
        </Field>
        {status !== order.status && <Alert tone="warn">O status será alterado de “{STATUS_META[order.status as keyof typeof STATUS_META]?.label}” para “{STATUS_META[status as keyof typeof STATUS_META]?.label}”.</Alert>}
        <Field label="Motivo da alteração" hint="Fica registrado na linha do tempo e na auditoria."><Input name="reason" maxLength={500} placeholder="Ex.: correção de cadastro, serviço executado fora do sistema…" /></Field>
      </section>

      {state?.error && <Alert>{state.error}</Alert>}
      <div className="flex justify-end gap-3 border-t border-line pt-6">
        <a href={`/os/${order.id}`} className="inline-flex h-10 items-center rounded-xl px-4 text-sm font-medium text-fg-2 hover:bg-bg-2">Cancelar</a>
        <SubmitButton pending={pending} pendingText="Salvando…">Salvar alterações</SubmitButton>
      </div>
    </form>
  );
}
