"use client";

import { useState, useTransition } from "react";
import { DoorOpen, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { deletePerson, registerEntry, savePerson } from "@/app/actions/portaria";
import { useFormSubmit } from "@/components/use-form-submit";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Badge, Button, Field, Input, Select, Textarea, cx } from "@/components/ui";
import { PERSON_KINDS, type PersonKind } from "@/lib/booking";

export type PersonData = {
  id: string; kind: string; unitId: string; name: string; document: string | null; phone: string | null; company: string | null;
  notes: string | null; validUntil: string | null; expired: boolean; unitLabel?: string;
};
type Opt = { id: string; label: string };

/** Cadastro ou edição de uma pessoa da unidade. `kinds` = tipos que quem está usando pode cadastrar. */
export function PersonForm({ person, units, kinds, defaultKind, onDone }: { person?: PersonData; units: Opt[]; kinds: PersonKind[]; defaultKind?: PersonKind; onDone?: () => void }) {
  const [kind, setKind] = useState<string>(person?.kind ?? defaultKind ?? kinds[0]);
  const [state, form, pending] = useFormSubmit(async (p: Awaited<ReturnType<typeof savePerson>>, f: FormData) => {
    const r = await savePerson(person?.id ?? null, p, f);
    if (r?.ok) onDone?.();
    return r;
  });
  return (
    <form {...form} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tipo">
          <Select name="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
            {kinds.map((k) => <option key={k} value={k}>{PERSON_KINDS[k].label}</option>)}
          </Select>
        </Field>
        {units.length === 1 ? (
          <input type="hidden" name="unitId" value={units[0].id} />
        ) : (
          <Field label="Unidade">
            <Select name="unitId" defaultValue={person?.unitId ?? ""} required>
              <option value="" disabled>Selecione…</option>
              {units.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
            </Select>
          </Field>
        )}
        <Field label="Nome"><Input name="name" required minLength={2} maxLength={120} defaultValue={person?.name} /></Field>
        <Field label="Documento (opcional)"><Input name="document" maxLength={40} defaultValue={person?.document ?? ""} placeholder="CPF ou RG" /></Field>
        <Field label="Telefone (opcional)"><Input name="phone" maxLength={30} defaultValue={person?.phone ?? ""} /></Field>
        {kind === "provider" && <Field label="Empresa / serviço"><Input name="company" maxLength={120} defaultValue={person?.company ?? ""} placeholder="Ex.: Diarista, Eletricista Silva" /></Field>}
        {kind !== "resident" && (
          <Field label="Autorizado até (opcional)" hint="Vazio = sem prazo. Vale até o fim do dia.">
            <Input type="date" name="validUntil" defaultValue={person?.validUntil ?? ""} />
          </Field>
        )}
      </div>
      <Field label="Observações (opcional)"><Textarea name="notes" rows={2} maxLength={500} defaultValue={person?.notes ?? ""} placeholder={kind === "provider" ? "Ex.: vem às terças, das 8h às 17h." : kind === "visitor" ? "Ex.: pode subir sem interfonar." : ""} /></Field>
      {state?.error && <Alert>{state.error}</Alert>}
      {state?.message && !onDone && <Alert tone="ok">{state.message}</Alert>}
      <div className="flex gap-2">
        <SubmitButton pending={pending} pendingText="Salvando…" size="sm">{person ? "Salvar" : "Cadastrar"}</SubmitButton>
        {onDone && <Button type="button" variant="ghost" size="sm" onClick={onDone}>Cancelar</Button>}
      </div>
    </form>
  );
}

/** Linha de pessoa cadastrada: editar, excluir e (na portaria) registrar entrada. */
export function PersonRow({ p, units, kinds, canEdit, gate }: { p: PersonData; units: Opt[]; kinds: PersonKind[]; canEdit: boolean; gate: boolean }) {
  const [editing, setEditing] = useState(false);
  const [removing, startRemove] = useTransition();
  if (editing) {
    return <li className="px-5 py-4"><PersonForm person={p} units={units} kinds={kinds.includes(p.kind as PersonKind) ? kinds : [p.kind as PersonKind]} onDone={() => setEditing(false)} /></li>;
  }
  return (
    <li className={cx("flex flex-wrap items-center gap-3 px-5 py-3", p.expired && "opacity-60")}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          {p.name}
          {p.unitLabel && <span className="font-normal text-muted"> · {p.unitLabel}</span>}
        </p>
        <p className="text-xs text-muted">
          {[p.company, p.document, p.phone, p.validUntil && `até ${p.validUntil.split("-").reverse().join("/")}`].filter(Boolean).join(" · ") || PERSON_KINDS[p.kind as PersonKind]?.label}
        </p>
        {p.notes && <p className="mt-0.5 whitespace-pre-line text-xs text-fg-2">{p.notes}</p>}
      </div>
      {p.expired && <Badge tone="muted">Vencido</Badge>}
      {gate && !p.expired && <EntryButton personId={p.id} name={p.name} />}
      {canEdit && (
        <div className="flex">
          <button type="button" onClick={() => setEditing(true)} className="rounded-lg p-1.5 text-muted hover:bg-bg-2 hover:text-fg" aria-label={`Editar ${p.name}`}><Pencil className="size-4" /></button>
          <button
            type="button"
            disabled={removing}
            onClick={() => confirm(`Remover ${p.name}?`) && startRemove(() => deletePerson(p.id))}
            className="rounded-lg p-1.5 text-muted hover:bg-bg-2 hover:text-bad"
            aria-label={`Remover ${p.name}`}
          >
            {removing ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
          </button>
        </div>
      )}
    </li>
  );
}

/** Registrar a entrada de alguém já cadastrado (um clique). */
function EntryButton({ personId, name }: { personId: string; name: string }) {
  const [state, form, pending] = useFormSubmit(registerEntry);
  return (
    <form {...form}>
      <input type="hidden" name="personId" value={personId} />
      <button type="submit" disabled={pending || !!state?.ok} className={cx("inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition", state?.ok ? "bg-ok/10 text-ok" : "border border-line text-fg-2 hover:bg-bg-2")} title={`Registrar a entrada de ${name}`}>
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <DoorOpen className="size-3.5" />}
        {state?.ok ? "Entrou" : "Entrada"}
      </button>
      {state?.error && <p className="text-xs text-bad">{state.error}</p>}
    </form>
  );
}

/** Portaria: registrar entrada de alguém sem cadastro (com opção de guardar para as próximas visitas). */
export function QuickEntryForm({ units }: { units: Opt[] }) {
  const [state, form, pending] = useFormSubmit(registerEntry);
  const [key, setKey] = useState(0);
  return (
    <form {...form} key={key} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome"><Input name="name" required minLength={2} maxLength={120} /></Field>
        <Field label="Para a unidade">
          <Select name="unitId" defaultValue="">
            <option value="">Condomínio / sem unidade</option>
            {units.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
          </Select>
        </Field>
        <Field label="Tipo">
          <Select name="kind" defaultValue="visitor">
            <option value="visitor">Visitante</option>
            <option value="provider">Prestador de serviço</option>
          </Select>
        </Field>
        <Field label="Documento (opcional)"><Input name="document" maxLength={40} /></Field>
      </div>
      <Field label="Observações (opcional)"><Input name="notes" maxLength={300} placeholder="Ex.: entrega, placa do carro ABC1D23" /></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="save" className="size-4 accent-[var(--brand)]" /> Guardar no cadastro da unidade (próximas visitas)</label>
      {state?.error && <Alert>{state.error}</Alert>}
      {state?.message && <Alert tone="ok">{state.message}</Alert>}
      <div className="flex gap-2">
        <SubmitButton pending={pending} pendingText="Registrando…" size="sm"><DoorOpen className="size-4" />Registrar entrada</SubmitButton>
        {state?.ok && <Button type="button" variant="ghost" size="sm" onClick={() => setKey((k) => k + 1)}>Nova entrada</Button>}
      </div>
    </form>
  );
}

/** Botão que abre o formulário de cadastro. */
export function AddPerson({ units, kinds, defaultKind, label }: { units: Opt[]; kinds: PersonKind[]; defaultKind?: PersonKind; label: string }) {
  const [open, setOpen] = useState(false);
  if (!open) return <Button variant="outline" size="sm" onClick={() => setOpen(true)}><Plus className="size-4" />{label}</Button>;
  return (
    <div className="rounded-2xl border border-line p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold">{label}</p>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1 text-muted hover:bg-bg-2" aria-label="Fechar"><X className="size-4" /></button>
      </div>
      <PersonForm units={units} kinds={kinds} defaultKind={defaultKind} onDone={() => setOpen(false)} />
    </div>
  );
}
