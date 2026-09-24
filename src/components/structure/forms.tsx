"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2, Trash2 } from "lucide-react";
import type { StructState } from "@/app/actions/structure";
import { CATEGORY_ICONS } from "@/lib/category-icons";
import { useFormSubmit } from "@/components/use-form-submit";
import { Alert, Field, Input, Select, Textarea, cx } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

type FormAction = (s: StructState, f: FormData) => Promise<StructState>;

/** Form com feedback (erro/sucesso) e reset opcional após salvar. */
export function ActionForm({ action, children, submit, reset = false, className, inline }: { action: FormAction; children: ReactNode; submit: string; reset?: boolean; className?: string; inline?: boolean }) {
  const [state, form, pending] = useFormSubmit(action);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && reset) ref.current?.reset();
  }, [state, reset]);
  return (
    <form ref={ref} {...form} className={cx(inline ? "flex flex-wrap items-end gap-3" : "space-y-4", className)}>
      {children}
      <SubmitButton pending={pending} variant={inline ? "outline" : "brand"} pendingText="Salvando…">{submit}</SubmitButton>
      {state?.error && <div className="basis-full"><Alert>{state.error}</Alert></div>}
      {state?.message && <p className="basis-full text-xs font-medium text-ok">{state.message}</p>}
    </form>
  );
}

/** Exclusão em dois passos (sem confirm() nativo, que alguns navegadores bloqueiam). */
export function DeleteButton({ action, confirmText, label }: { action: (s: StructState) => Promise<StructState>; confirmText: string; label?: string }) {
  const [state, run, pending] = useActionState(action, undefined);
  const [asking, setAsking] = useState(false);
  return (
    <span className="inline-flex flex-col items-end gap-1">
      {asking ? (
        <form
          action={() => {
            setAsking(false);
            run();
          }}
          className="flex flex-wrap items-center justify-end gap-2 rounded-xl bg-bad/10 px-3 py-2"
        >
          <span className="text-xs font-medium text-bad">{confirmText}</span>
          <button type="submit" className="rounded-lg bg-bad px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90">Excluir</button>
          <button type="button" onClick={() => setAsking(false)} className="rounded-lg px-2 py-1 text-xs font-medium text-fg-2 hover:bg-bg-2">Cancelar</button>
        </form>
      ) : (
        <button type="button" disabled={pending} onClick={() => setAsking(true)} className="inline-flex items-center gap-1.5 rounded-lg p-1.5 text-xs text-muted transition hover:bg-bad/10 hover:text-bad disabled:opacity-60">
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
          {pending ? "Excluindo…" : label}
        </button>
      )}
      {state?.error && !asking && !pending && <span className="max-w-72 rounded-lg bg-bad/10 px-2.5 py-1.5 text-right text-xs font-medium text-bad">{state.error}</span>}
    </span>
  );
}

// ───────────────────────────── Específicos ─────────────────────────────

export function BuildingCreateForm({ action }: { action: FormAction }) {
  return (
    <ActionForm action={action} submit="Adicionar torre/bloco" reset>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Nome"><Input name="name" required placeholder="Torre C" /></Field>
        <Field label="Andares" hint="Opcional: gera as unidades"><Input name="floors" type="number" min={0} max={80} placeholder="0" /></Field>
        <Field label="Unidades por andar"><Input name="perFloor" type="number" min={0} max={30} placeholder="0" /></Field>
      </div>
    </ActionForm>
  );
}

export function RenameForm({ action, name }: { action: FormAction; name: string }) {
  return (
    <ActionForm action={action} submit="Renomear" inline>
      <Field label="Nome" className="min-w-48 flex-1"><Input name="name" defaultValue={name} required /></Field>
    </ActionForm>
  );
}

const UNIT_TYPES = [
  ["apartment", "Apartamento"],
  ["house", "Casa"],
  ["commercial", "Sala comercial"],
  ["other", "Outro"],
] as const;

export function UnitFields({ number, floor, type }: { number?: string; floor?: number | null; type?: string }) {
  return (
    <>
      <Field label="Número" className="w-28"><Input name="number" defaultValue={number} required placeholder="101" /></Field>
      <Field label="Andar" className="w-24"><Input name="floor" type="number" defaultValue={floor ?? ""} /></Field>
      <Field label="Tipo" className="w-44">
        <Select name="type" defaultValue={type ?? "apartment"}>
          {UNIT_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
      </Field>
    </>
  );
}

export function UnitCreateForm({ action }: { action: FormAction }) {
  return <ActionForm action={action} submit="Adicionar" inline reset><UnitFields /></ActionForm>;
}

export function UnitEditForm({ action, number, floor, type }: { action: FormAction; number: string; floor: number | null; type: string }) {
  return <ActionForm action={action} submit="Salvar" inline><UnitFields number={number} floor={floor} type={type} /></ActionForm>;
}

export function UnitGenerateForm({ action }: { action: FormAction }) {
  return (
    <ActionForm action={action} submit="Gerar unidades" inline reset>
      <Field label="Do andar" className="w-24"><Input name="fromFloor" type="number" min={0} required defaultValue={1} /></Field>
      <Field label="Até o andar" className="w-28"><Input name="toFloor" type="number" min={0} required /></Field>
      <Field label="Unid. por andar" className="w-32"><Input name="perFloor" type="number" min={1} max={30} required /></Field>
    </ActionForm>
  );
}

export function AreaForm({ action, area, submit }: { action: FormAction; area?: { name: string; description: string | null; capacity: number | null; reservable: boolean }; submit: string }) {
  return (
    <ActionForm action={action} submit={submit} reset={!area}>
      <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
        <Field label="Nome"><Input name="name" defaultValue={area?.name} required placeholder="Espaço gourmet" /></Field>
        <Field label="Capacidade"><Input name="capacity" type="number" min={1} defaultValue={area?.capacity ?? ""} placeholder="pessoas" /></Field>
      </div>
      <Field label="Descrição"><Textarea name="description" rows={2} defaultValue={area?.description ?? ""} /></Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="reservable" defaultChecked={area?.reservable} className="size-4 accent-[var(--brand)]" /> Pode ser reservada por moradores
      </label>
    </ActionForm>
  );
}

const SWATCHES = ["#5B5BD6", "#0E9384", "#16A34A", "#D97706", "#DC2626", "#0284C7", "#9333EA", "#DB2777", "#64748B", "#A16207"];

export function CategoryForm({ action, category, submit }: { action: FormAction; category?: { name: string; color: string; icon: string }; submit: string }) {
  const [color, setColor] = useState(category?.color ?? SWATCHES[0]);
  const [icon, setIcon] = useState(category?.icon ?? "wrench");
  return (
    <ActionForm action={action} submit={submit} reset={!category}>
      <input type="hidden" name="color" value={color} />
      <input type="hidden" name="icon" value={icon} />
      <Field label="Nome"><Input name="name" defaultValue={category?.name} required placeholder="Ex.: Ar-condicionado" /></Field>
      <div>
        <p className="mb-1.5 text-[13px] font-medium text-fg-2">Cor</p>
        <div className="flex flex-wrap items-center gap-2">
          {SWATCHES.map((c) => (
            <button key={c} type="button" onClick={() => setColor(c)} aria-label={c} className={cx("size-7 rounded-full ring-offset-2 ring-offset-surface transition", color.toLowerCase() === c.toLowerCase() && "ring-2 ring-fg")} style={{ background: c }} />
          ))}
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="size-7 cursor-pointer rounded-full border-0 bg-transparent p-0" aria-label="Cor personalizada" />
        </div>
      </div>
      <div>
        <p className="mb-1.5 text-[13px] font-medium text-fg-2">Ícone</p>
        <div className="grid grid-cols-8 gap-1.5">
          {Object.entries(CATEGORY_ICONS).map(([k, { icon: Icon, label }]) => (
            <button
              key={k}
              type="button"
              title={label}
              onClick={() => setIcon(k)}
              className={cx("flex aspect-square items-center justify-center rounded-lg border transition", icon === k ? "border-transparent text-white" : "border-line text-muted hover:text-fg")}
              style={icon === k ? { background: color } : undefined}
            >
              <Icon className="size-4" />
            </button>
          ))}
        </div>
      </div>
    </ActionForm>
  );
}
