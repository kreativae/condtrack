"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Ban, DoorOpen, Loader2, LogOut, Pencil, Plus, Trash2, UserPlus, X } from "lucide-react";
import { createGrant, deleteGrant, deletePerson, markExit, registerEntry, setBlocked, updateGrant, updatePerson, type PortariaState } from "@/app/actions/portaria";
import { useFormSubmit } from "@/components/use-form-submit";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Badge, Button, Field, Input, Select, Textarea, cx } from "@/components/ui";
import { GRANT_STATUS, PERSON_KINDS, WEEKDAY_SHORT, parseWeekdays, type PersonKind } from "@/lib/booking";
import type { GrantData } from "@/lib/booking-server";
import type { UnitOption } from "@/lib/unit-search";
import { UnitPicker } from "./unit-picker";

type Opt = { id: string; label: string };
export type PersonBasics = { id: string; name: string; document: string | null; phone: string | null; company: string | null };

/** Autorização: pessoa (nome, documento…) + para onde, tipo, dias, horário e prazo. */
export function GrantForm({ grant, person, personId, units, kinds, allowCondo, canEditPerson = true, fixedUnit, onDone, openAfter }: {
  grant?: GrantData; person?: PersonBasics; units: Opt[]; kinds: PersonKind[]; allowCondo?: boolean; canEditPerson?: boolean;
  /** Nova autorização para uma pessoa já cadastrada (ficha): sem os campos de pessoa. */
  personId?: string;
  fixedUnit?: string; onDone?: () => void; openAfter?: boolean;
}) {
  const [kind, setKind] = useState<string>(grant?.kind ?? kinds.find((k) => k !== "resident") ?? kinds[0]);
  const [days, setDays] = useState<number[]>(parseWeekdays(grant?.weekdays ?? ""));
  const [state, form, pending] = useFormSubmit(async (p: PortariaState, f: FormData) => {
    const r = grant ? await updateGrant(grant.id, p, f) : await createGrant(p, f);
    if (r?.ok) onDone?.();
    return r;
  });
  const resident = kind === "resident";
  return (
    <form {...form} className="space-y-4">
      {openAfter && <input type="hidden" name="open" value="1" />}
      {personId && <input type="hidden" name="personId" value={personId} />}
      {days.map((d) => <input key={d} type="hidden" name="weekdays" value={d} />)}
      {!personId && (canEditPerson || !grant) && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome"><Input name="name" required minLength={2} maxLength={120} defaultValue={person?.name} /></Field>
          <Field label="Documento" hint="CPF ou RG. Se a pessoa já estiver cadastrada, o cadastro é reaproveitado."><Input name="document" maxLength={40} defaultValue={person?.document ?? ""} /></Field>
          <Field label="Telefone (opcional)"><Input name="phone" maxLength={30} defaultValue={person?.phone ?? ""} /></Field>
          {(kind === "provider" || kind === "delivery") && <Field label="Empresa / serviço"><Input name="company" maxLength={120} defaultValue={person?.company ?? ""} placeholder="Diarista, Eletricista Silva, Mercado Livre" /></Field>}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tipo">
          <Select name="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
            {kinds.map((k) => <option key={k} value={k}>{PERSON_KINDS[k].label}</option>)}
          </Select>
        </Field>
        {grant || fixedUnit ? (
          <input type="hidden" name="unitId" value={grant?.unitId ?? fixedUnit ?? ""} />
        ) : units.length === 1 && !allowCondo ? (
          <input type="hidden" name="unitId" value={units[0].id} />
        ) : (
          <Field label="Para onde" hint={allowCondo ? "Vazio = condomínio (áreas comuns, administração)." : undefined}>
            <UnitPicker units={units as UnitOption[]} name="unitId" allowEmptyLabel={allowCondo ? "Condomínio (áreas comuns, administração)" : undefined} />
          </Field>
        )}
      </div>
      {!resident && (
        <div className="space-y-3 rounded-xl bg-bg-2 p-4">
          <div>
            <p className="mb-1.5 text-[13px] font-medium text-fg-2">Dias da semana <span className="font-normal text-muted">(nenhum marcado = todos)</span></p>
            <div className="flex flex-wrap gap-1">
              {WEEKDAY_SHORT.map((d, i) => (
                <button key={d} type="button" aria-pressed={days.includes(i)} onClick={() => setDays(days.includes(i) ? days.filter((x) => x !== i) : [...days, i].sort())}
                  className={cx("h-8 min-w-11 rounded-lg px-2 text-xs font-medium transition", days.includes(i) ? "bg-brand text-brand-ink" : "border border-line bg-surface text-fg-2 hover:bg-bg-2")}>{d}</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Das"><Input type="time" name="timeFrom" defaultValue={grant?.timeFrom ?? ""} /></Field>
            <Field label="Às"><Input type="time" name="timeTo" defaultValue={grant?.timeTo ?? ""} /></Field>
            <Field label="A partir de"><Input type="date" name="validFrom" defaultValue={grant?.validFrom ?? ""} /></Field>
            <Field label="Até"><Input type="date" name="validUntil" defaultValue={grant?.validUntil ?? ""} /></Field>
          </div>
          <p className="text-xs text-muted">Visita de um dia só: mesma data em “A partir de” e “Até”. Tudo vazio = sempre liberado.</p>
        </div>
      )}
      <Field label="Observações (opcional)"><Textarea name="notes" rows={2} maxLength={500} defaultValue={grant?.notes ?? ""} placeholder={resident ? "Ex.: filho, mãe" : "Ex.: pode subir sem interfonar; carro placa ABC1D23"} /></Field>
      {state?.error && <Alert>{state.error}</Alert>}
      {state?.message && !onDone && <Alert tone="ok">{state.message}</Alert>}
      <div className="flex gap-2">
        <SubmitButton pending={pending} pendingText="Salvando…" size="sm">{grant ? "Salvar" : "Autorizar"}</SubmitButton>
        {onDone && <Button type="button" variant="ghost" size="sm" onClick={onDone}>Cancelar</Button>}
      </div>
    </form>
  );
}

/** Linha de autorização: título (pessoa ou unidade), horário, situação; editar e revogar. */
export function GrantRow({ g, title, href, person, units, kinds, canEdit, canEditPerson, extra }: {
  g: GrantData; title: string; href?: string; person?: PersonBasics; units: Opt[]; kinds: PersonKind[]; canEdit: boolean; canEditPerson?: boolean; extra?: React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [removing, startRemove] = useTransition();
  const st = GRANT_STATUS[g.status];
  if (editing) return <li className="px-5 py-4"><GrantForm grant={g} person={person} units={units} kinds={kinds.includes(g.kind as PersonKind) ? kinds : [g.kind as PersonKind]} canEditPerson={canEditPerson} onDone={() => setEditing(false)} /></li>;
  return (
    <li className={cx("flex flex-wrap items-center gap-3 px-5 py-3", g.status === "expired" && "opacity-60")}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{href ? <Link href={href} className="hover:text-brand">{title}</Link> : title}</p>
        <p className="text-xs text-fg-2">{g.schedule}</p>
        {g.notes && <p className="text-xs text-muted">{g.notes}</p>}
        {g.createdByName && <p className="text-[11px] text-muted">Autorizado por {g.createdByName}</p>}
      </div>
      <Badge tone="muted">{PERSON_KINDS[g.kind as PersonKind]?.label ?? g.kind}</Badge>
      {g.kind !== "resident" && <Badge tone={st.tone}>{st.label}</Badge>}
      {extra}
      {canEdit && (
        <div className="flex">
          <button type="button" onClick={() => setEditing(true)} className="rounded-lg p-1.5 text-muted hover:bg-bg-2 hover:text-fg" aria-label="Editar autorização"><Pencil className="size-4" /></button>
          <button type="button" disabled={removing} onClick={() => confirm("Revogar esta autorização?") && startRemove(() => deleteGrant(g.id))} className="rounded-lg p-1.5 text-muted hover:bg-bg-2 hover:text-bad" aria-label="Revogar autorização">
            {removing ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
          </button>
        </div>
      )}
    </li>
  );
}

/** Botão que abre o formulário de nova autorização. */
export function AddGrant({ label, ...props }: { label: string } & Parameters<typeof GrantForm>[0]) {
  const [open, setOpen] = useState(false);
  if (!open) return <Button variant="outline" size="sm" onClick={() => setOpen(true)}><Plus className="size-4" />{label}</Button>;
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold">{label}</p>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1 text-muted hover:bg-bg-2" aria-label="Fechar"><X className="size-4" /></button>
      </div>
      <GrantForm {...props} onDone={props.openAfter ? undefined : () => setOpen(false)} />
    </div>
  );
}

/**
 * Registrar entrada. Com `person`: escolhe um ou vários destinos (as unidades autorizadas hoje já vêm marcadas).
 * Sem `person`: digita nome e documento (se o documento já existir, a entrada é ligada à pessoa).
 */
export function EntryForm({ person, units, suggested = [], defaultUnitIds = [], onDone }: {
  person?: { id: string; name: string }; units: Opt[]; suggested?: { unitId: string | null; label: string; ok: boolean }[];
  /** Aberto pelo cartão da unidade: ela já vem marcada. */
  defaultUnitIds?: string[]; onDone?: () => void;
}) {
  const [state, form, pending] = useFormSubmit(registerEntry);
  const [checked, setChecked] = useState<string[]>([...suggested.filter((s) => s.ok && s.unitId).map((s) => s.unitId!), ...defaultUnitIds]);
  const [extra, setExtra] = useState<string[]>(defaultUnitIds.filter((id) => !suggested.some((s) => s.unitId === id)));
  const options = [...suggested.filter((s) => s.unitId).map((s) => ({ id: s.unitId!, label: s.label, ok: s.ok })), ...extra.map((id) => ({ id, label: units.find((u) => u.id === id)?.label ?? id, ok: false }))];
  const toggle = (id: string) => setChecked(checked.includes(id) ? checked.filter((x) => x !== id) : [...checked, id]);
  const unauthorized = checked.filter((id) => !options.find((o) => o.id === id)?.ok);
  if (state?.ok) {
    return (
      <div className="space-y-3">
        <Alert tone="ok">{state.message}</Alert>
        {onDone && <Button size="sm" variant="outline" onClick={onDone}>Fechar</Button>}
      </div>
    );
  }
  return (
    <form {...form} className="space-y-4">
      {person && <input type="hidden" name="personId" value={person.id} />}
      {checked.map((id) => <input key={id} type="hidden" name="unitIds" value={id} />)}
      {!person && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome"><Input name="name" required minLength={2} maxLength={120} /></Field>
          <Field label="Documento (opcional)"><Input name="document" maxLength={40} /></Field>
          <Field label="Tipo">
            <Select name="kind" defaultValue="visitor">
              <option value="visitor">Visitante</option>
              <option value="provider">Prestador de serviço</option>
              <option value="delivery">Entrega</option>
            </Select>
          </Field>
          <Field label="Empresa (opcional)"><Input name="company" maxLength={120} /></Field>
        </div>
      )}
      <div>
        <p className="mb-1.5 text-[13px] font-medium text-fg-2">Para onde vai{person ? ` ${person.name.split(" ")[0]}` : ""}?</p>
        <div className="space-y-1.5">
          {options.map((o) => (
            <label key={o.id} className={cx("flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2 text-sm transition", checked.includes(o.id) ? "border-brand bg-brand/5" : "border-line hover:bg-bg-2")}>
              <input type="checkbox" checked={checked.includes(o.id)} onChange={() => toggle(o.id)} className="size-4 accent-[var(--brand)]" />
              <span className="flex-1">{o.label}</span>
              {person && <Badge tone={o.ok ? "ok" : "muted"}>{o.ok ? "Autorizada hoje" : "Sem autorização hoje"}</Badge>}
            </label>
          ))}
          <UnitPicker
            key={extra.length}
            units={(units as UnitOption[]).filter((u) => !options.some((o) => o.id === u.id))}
            placeholder={options.length ? "Outra unidade (digite: 502, aurora 502)" : "Unidade (digite: 502, aurora 502)"}
            onChange={(v) => { if (v && !options.some((o) => o.id === v)) { setExtra([...extra, v]); setChecked([...checked, v]); } }}
          />
          {!checked.length && <p className="text-xs text-muted">Sem unidade marcada = entrada para o condomínio (áreas comuns, administração).</p>}
        </div>
        {person && unauthorized.length > 0 && <p className="mt-2 text-xs text-warn">Sem autorização para hoje em {unauthorized.length} destino(s): a unidade recebe o aviso com esse alerta.</p>}
      </div>
      <Field label="Observação (opcional)"><Input name="notes" maxLength={300} placeholder="Placa do carro, volume, motivo" /></Field>
      {!person && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="save" defaultChecked className="size-4 accent-[var(--brand)]" /> Guardar o cadastro (a visita entra no histórico da pessoa)</label>}
      {state?.error && <Alert>{state.error}</Alert>}
      <div className="flex gap-2">
        <SubmitButton pending={pending} pendingText="Registrando…" size="sm"><DoorOpen className="size-4" />Confirmar entrada</SubmitButton>
        {onDone && <Button type="button" variant="ghost" size="sm" onClick={onDone}>Cancelar</Button>}
      </div>
    </form>
  );
}

/** Entrada com um clique para quem é esperado hoje (destinos já definidos). */
export function QuickEntryButton({ personId, unitIds, name }: { personId: string; unitIds: string[]; name: string }) {
  const [state, form, pending] = useFormSubmit(registerEntry);
  return (
    <form {...form}>
      <input type="hidden" name="personId" value={personId} />
      {unitIds.map((u) => <input key={u} type="hidden" name="unitIds" value={u} />)}
      <button type="submit" disabled={pending || !!state?.ok} title={state?.error ?? `Registrar a entrada de ${name}`}
        className={cx("inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition", state?.ok ? "bg-ok/10 text-ok" : state?.error ? "bg-bad/10 text-bad" : "border border-line text-fg-2 hover:bg-bg-2")}>
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <DoorOpen className="size-3.5" />}
        {state?.ok ? "Entrou" : state?.error ? "Impedido" : "Entrada"}
      </button>
    </form>
  );
}

/** Registrar a saída de quem está no condomínio. */
export function ExitButton({ entryId }: { entryId: string }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} onClick={() => start(() => markExit(entryId))} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-line px-2.5 text-xs font-medium text-fg-2 transition hover:bg-bg-2">
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <LogOut className="size-3.5" />}Saiu
    </button>
  );
}

/** Topo da portaria: entrada avulsa ou cadastro de pessoa sem sair da tela. */
export function GateQuickActions({ units, kinds }: { units: Opt[]; kinds: PersonKind[] }) {
  const [open, setOpen] = useState<"entry" | "person" | null>(null);
  return (
    <>
      <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:shrink-0">
        <Button className="h-11 sm:h-14" variant={open === "entry" ? "brand" : "outline"} onClick={() => setOpen(open === "entry" ? null : "entry")}><DoorOpen className="size-4" /><span className="sm:hidden">Entrada</span><span className="hidden sm:inline">Registrar entrada</span></Button>
        <Button className="h-11 sm:h-14" variant={open === "person" ? "brand" : "outline"} onClick={() => setOpen(open === "person" ? null : "person")}><UserPlus className="size-4" /><span className="sm:hidden">Cadastrar</span><span className="hidden sm:inline">Cadastrar pessoa</span></Button>
      </div>
      {open && (
        <div className="basis-full rounded-2xl border border-line bg-surface p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="font-display text-base font-semibold">{open === "entry" ? "Registrar entrada (sem cadastro)" : "Cadastrar pessoa e autorizar"}</p>
            <button type="button" onClick={() => setOpen(null)} className="rounded-lg p-1 text-muted hover:bg-bg-2" aria-label="Fechar"><X className="size-4" /></button>
          </div>
          {open === "entry" ? <EntryForm units={units} onDone={() => setOpen(null)} /> : <GrantForm units={units} kinds={kinds} allowCondo openAfter />}
        </div>
      )}
    </>
  );
}

/** Ficha: editar dados da pessoa. */
export function PersonEditForm({ person, notes, onDone }: { person: PersonBasics; notes: string | null; onDone: () => void }) {
  const [state, form, pending] = useFormSubmit(async (p: PortariaState, f: FormData) => {
    const r = await updatePerson(person.id, p, f);
    if (r?.ok) onDone();
    return r;
  });
  return (
    <form {...form} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome"><Input name="name" required minLength={2} maxLength={120} defaultValue={person.name} /></Field>
        <Field label="Documento"><Input name="document" maxLength={40} defaultValue={person.document ?? ""} /></Field>
        <Field label="Telefone"><Input name="phone" maxLength={30} defaultValue={person.phone ?? ""} /></Field>
        <Field label="Empresa / serviço"><Input name="company" maxLength={120} defaultValue={person.company ?? ""} /></Field>
      </div>
      <Field label="Observações da portaria"><Textarea name="notes" rows={2} maxLength={500} defaultValue={notes ?? ""} /></Field>
      {state?.error && <Alert>{state.error}</Alert>}
      <div className="flex gap-2">
        <SubmitButton pending={pending} pendingText="Salvando…" size="sm">Salvar</SubmitButton>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>Cancelar</Button>
      </div>
    </form>
  );
}

/** Ficha: ações do topo (registrar entrada, editar, impedir/liberar). */
export function PersonActions({ person, notes, blocked, units, suggested }: { person: PersonBasics; notes: string | null; blocked: boolean; units: Opt[]; suggested: { unitId: string | null; label: string; ok: boolean }[] }) {
  const [open, setOpen] = useState<"entry" | "edit" | "block" | null>(null);
  const [state, form, pending] = useFormSubmit((p: PortariaState, f: FormData) => setBlocked(person.id, !blocked, p, f));
  const [removing, startRemove] = useTransition();
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {!blocked && <Button variant={open === "entry" ? "brand" : "outline"} onClick={() => setOpen(open === "entry" ? null : "entry")}><DoorOpen className="size-4" />Registrar entrada</Button>}
        <Button variant="outline" onClick={() => setOpen(open === "edit" ? null : "edit")}><Pencil className="size-4" />Editar dados</Button>
        <Button variant={blocked ? "outline" : "ghost"} className={blocked ? "" : "text-bad"} onClick={() => setOpen(open === "block" ? null : "block")}><Ban className="size-4" />{blocked ? "Liberar entrada" : "Impedir entrada"}</Button>
        <Button
          variant="ghost"
          className="text-bad sm:ml-auto"
          disabled={removing}
          onClick={() => confirm(`Excluir o contato ${person.name}?\n\nAs autorizações dele saem do sistema. As entradas já registradas continuam no histórico da portaria, com o nome.`) && startRemove(() => deletePerson(person.id))}
        >
          {removing ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}Excluir contato
        </Button>
      </div>
      {open === "entry" && <div className="rounded-2xl border border-line p-4"><EntryForm person={person} units={units} suggested={suggested} onDone={() => setOpen(null)} /></div>}
      {open === "edit" && <div className="rounded-2xl border border-line p-4"><PersonEditForm person={person} notes={notes} onDone={() => setOpen(null)} /></div>}
      {open === "block" && (
        <form {...form} className="space-y-3 rounded-2xl border border-line p-4">
          {!blocked && <Field label="Motivo (só a portaria e o síndico veem)"><Input name="reason" required minLength={3} maxLength={300} /></Field>}
          {state?.error && <Alert>{state.error}</Alert>}
          {state?.ok ? <Alert tone="ok">{state.message}</Alert> : (
            <div className="flex gap-2">
              <SubmitButton pending={pending} pendingText="Salvando…" size="sm" variant={blocked ? "brand" : "danger"}>{blocked ? "Liberar a entrada" : "Impedir a entrada"}</SubmitButton>
              <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(null)}>Cancelar</Button>
            </div>
          )}
        </form>
      )}
    </div>
  );
}
