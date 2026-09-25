"use client";

import { startTransition, useActionState, useState, type FormEvent, type ReactNode } from "react";
import { Pencil } from "lucide-react";
import { adminUpdateResponsibles } from "@/app/actions/orders";
import { ROLE_LABEL, type Role } from "@/lib/roles";
import { Alert, Card, CardHeader, Field, Input, Select, buttonClass, cx } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

type Person = { id: string; name: string; role: string };
type Current = Record<"requestedById" | "assignedToId" | "validatedById" | "approvedById", string | null> &
  Record<"createdAt" | "assignedAt" | "startedAt" | "completedAt" | "validatedAt" | "approvedAt", string | null>;

/** ISO → valor do <input type="datetime-local"> no fuso do navegador. */
function toLocal(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Card "Responsáveis". Para o superadmin, "Editar" troca a visualização por um
 * formulário com as pessoas e as datas/horas de cada etapa.
 */
export function ResponsiblesCard({ view, orderId, current, people, editable }: { view: ReactNode; orderId: string; current: Current; people: Person[]; editable: boolean }) {
  const [editing, setEditing] = useState(false);
  return (
    <Card>
      <CardHeader
        title="Responsáveis"
        action={editable && !editing ? (
          <button type="button" onClick={() => setEditing(true)} className={buttonClass("ghost", "sm")}><Pencil className="size-3.5" />Editar</button>
        ) : undefined}
      />
      {editing ? <EditForm orderId={orderId} current={current} people={people} onDone={() => setEditing(false)} /> : view}
    </Card>
  );
}

function EditForm({ orderId, current, people, onDone }: { orderId: string; current: Current; people: Person[]; onDone: () => void }) {
  const [state, run, pending] = useActionState(async (prev: Awaited<ReturnType<typeof adminUpdateResponsibles>>, fd: FormData) => {
    const r = await adminUpdateResponsibles(orderId, prev, fd);
    if (r?.ok) onDone();
    return r;
  }, undefined);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    // datetime-local vem no fuso do navegador: envia em ISO (UTC) para o servidor
    for (const k of ["createdAt", "assignedAt", "startedAt", "completedAt", "validatedAt", "approvedAt"]) {
      const v = String(fd.get(k) ?? "");
      fd.set(k, v ? new Date(v).toISOString() : "");
    }
    startTransition(() => run(fd));
  }

  const providers = people.filter((p) => p.role === "provider");
  const who = (name: string, label: string, list: Person[], optional = true) => (
    <Field label={label}>
      <Select name={name} defaultValue={current[name as keyof Current] ?? ""}>
        {optional && <option value="">— Pendente —</option>}
        {list.map((p) => <option key={p.id} value={p.id}>{p.name} · {ROLE_LABEL[p.role as Role] ?? p.role}</option>)}
      </Select>
    </Field>
  );
  const when = (name: keyof Current, label: string) => (
    <Field label={label}><Input type="datetime-local" name={name} defaultValue={toLocal(current[name])} /></Field>
  );

  return (
    <form onSubmit={onSubmit} className="space-y-5 p-5 text-sm">
      <Group title="Abertura">
        {who("requestedById", "Solicitado por", people, false)}
        {when("createdAt", "Aberta em")}
      </Group>
      <Group title="Execução">
        {who("assignedToId", "Executado por", providers)}
        {when("assignedAt", "Atribuída em")}
        {when("startedAt", "Iniciada em")}
        {when("completedAt", "Concluída em")}
      </Group>
      <Group title="Validação">
        {who("validatedById", "Validado por", people)}
        {when("validatedAt", "Validada em")}
      </Group>
      <Group title="Aprovação">
        {who("approvedById", "Aprovado por", people)}
        {when("approvedAt", "Aprovada em")}
      </Group>
      <Field label="Motivo (opcional)" hint="Fica registrado na linha do tempo e na auditoria.">
        <Input name="reason" maxLength={500} placeholder="Ex.: correção de lançamento" />
      </Field>
      {state?.error && <Alert>{state.error}</Alert>}
      <div className="flex gap-2">
        <SubmitButton pending={pending} pendingText="Salvando…">Salvar</SubmitButton>
        <button type="button" onClick={onDone} disabled={pending} className={buttonClass("ghost")}>Cancelar</button>
      </div>
    </form>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className={cx("space-y-3 rounded-xl border border-line p-3")}>
      <legend className="px-1 text-xs font-semibold text-muted">{title}</legend>
      {children}
    </fieldset>
  );
}
