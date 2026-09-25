"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2, Trash2 } from "lucide-react";
import type { StructState } from "@/app/actions/structure";
import { CATEGORY_ICONS } from "@/lib/category-icons";
import { HOUSE_NOUNS, LAYOUTS, UNIT_TYPES } from "@/lib/units";
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

type Kind = "tower" | "block";

/** Tipo do condomínio e nome das unidades horizontais (casa ou lote). */
export function LayoutForm({ action, layout, houseNoun, unitCount }: { action: FormAction; layout: string; houseNoun: string; unitCount: number }) {
  const [value, setValue] = useState(layout);
  return (
    <ActionForm action={action} submit="Salvar tipo">
      <div className="grid gap-2 sm:grid-cols-3">
        {Object.entries(LAYOUTS).map(([k, l]) => (
          <label key={k} className={cx("cursor-pointer rounded-xl border px-4 py-3 transition", value === k ? "border-brand bg-brand-soft" : "border-line hover:bg-bg-2")}>
            <input type="radio" name="layout" value={k} checked={value === k} onChange={() => setValue(k)} className="sr-only" />
            <span className={cx("block text-sm font-semibold", value === k && "text-brand")}>{l.label}</span>
            <span className="mt-0.5 block text-xs text-muted">{l.hint}</span>
          </label>
        ))}
      </div>
      {value !== "vertical" && (
        <Field label="Como chamar as unidades das quadras" className="sm:max-w-xs">
          <Select name="houseNoun" defaultValue={houseNoun}>
            {Object.entries(HOUSE_NOUNS).map(([k, n]) => <option key={k} value={k}>{n.one} ({n.many.toLowerCase()})</option>)}
          </Select>
        </Field>
      )}
      {value !== layout && unitCount > 0 && (
        <p className="rounded-xl bg-warn/10 px-3 py-2 text-xs text-warn">
          {value === "vertical" ? "As casas/lotes existentes passarão a ser apartamentos." : value === "horizontal" ? "Torres viram quadras e os apartamentos existentes passam a ser casas/lotes." : "Os agrupamentos atuais continuam como estão; escolha o tipo de cada novo."}
        </p>
      )}
    </ActionForm>
  );
}

export function BuildingCreateForm({ action, layout, houseNoun }: { action: FormAction; layout: string; houseNoun: string }) {
  const [kind, setKind] = useState<Kind>(layout === "horizontal" ? "block" : "tower");
  const house = HOUSE_NOUNS[houseNoun as keyof typeof HOUSE_NOUNS] ?? HOUSE_NOUNS.house;
  return (
    <ActionForm action={action} submit={kind === "block" ? "Adicionar quadra/rua" : "Adicionar torre/bloco"} reset>
      {layout === "mixed" && (
        <div className="inline-flex rounded-xl bg-bg-2 p-1 text-sm">
          {(["tower", "block"] as const).map((k) => (
            <button key={k} type="button" onClick={() => setKind(k)} className={cx("rounded-lg px-3 py-1.5 font-medium transition", kind === k ? "bg-surface text-fg shadow-card" : "text-muted hover:text-fg")}>
              {k === "tower" ? "Torre/bloco" : "Quadra/rua"}
            </button>
          ))}
          <input type="hidden" name="kind" value={kind} />
        </div>
      )}
      {kind === "block" ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Nome"><Input name="name" required placeholder="Quadra A" /></Field>
          <Field label={`Quantidade de ${house.many.toLowerCase()}`} hint="Opcional: numera de 1 em diante"><Input name="houses" type="number" min={0} max={2000} placeholder="0" /></Field>
          <Field label="Prefixo" hint="Opcional, ex.: A-"><Input name="prefix" maxLength={8} placeholder="—" /></Field>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Nome"><Input name="name" required placeholder="Torre C" /></Field>
          <Field label="Andares" hint="Opcional: gera as unidades"><Input name="floors" type="number" min={0} max={80} placeholder="0" /></Field>
          <Field label="Unidades por andar"><Input name="perFloor" type="number" min={0} max={30} placeholder="0" /></Field>
        </div>
      )}
    </ActionForm>
  );
}

export function RenameForm({ action, name, kind, implicit }: { action: FormAction; name: string; kind: string; implicit: boolean }) {
  return (
    <ActionForm action={action} submit="Salvar" inline>
      <Field label="Nome" className="min-w-48 flex-1"><Input name="name" defaultValue={name} required /></Field>
      {kind === "block" && (
        <label className="flex basis-full items-center gap-2 text-sm text-fg-2">
          <input type="checkbox" name="implicit" defaultChecked={implicit} className="size-4 accent-[var(--brand)]" />
          Condomínio sem quadras: não mostrar este nome (aparece só “Casa 12” / “Lote 12”)
        </label>
      )}
    </ActionForm>
  );
}

export function UnitFields({ number, floor, type, kind, houseNoun }: { number?: string; floor?: number | null; type?: string; kind: string; houseNoun: string }) {
  const block = kind === "block";
  // Na quadra não existe apartamento; na torre não existe lote
  const types = Object.entries(UNIT_TYPES).filter(([k]) => (block ? k !== "apartment" : k !== "lot"));
  return (
    <>
      <Field label="Número" className="w-28"><Input name="number" defaultValue={number} required placeholder={block ? "12" : "101"} /></Field>
      {!block && <Field label="Andar" className="w-24"><Input name="floor" type="number" defaultValue={floor ?? ""} /></Field>}
      <Field label="Tipo" className="w-44">
        <Select name="type" defaultValue={type ?? (block ? houseNoun : "apartment")}>
          {types.map(([v, l]) => <option key={v} value={v}>{l.one}</option>)}
        </Select>
      </Field>
    </>
  );
}

export function UnitCreateForm({ action, kind, houseNoun }: { action: FormAction; kind: string; houseNoun: string }) {
  return <ActionForm action={action} submit="Adicionar" inline reset><UnitFields kind={kind} houseNoun={houseNoun} /></ActionForm>;
}

export function UnitEditForm({ action, number, floor, type, kind, houseNoun }: { action: FormAction; number: string; floor: number | null; type: string; kind: string; houseNoun: string }) {
  return <ActionForm action={action} submit="Salvar" inline><UnitFields number={number} floor={floor} type={type} kind={kind} houseNoun={houseNoun} /></ActionForm>;
}

export function UnitGenerateForm({ action, kind, houseNoun }: { action: FormAction; kind: string; houseNoun: string }) {
  if (kind === "block") {
    const house = HOUSE_NOUNS[houseNoun as keyof typeof HOUSE_NOUNS] ?? HOUSE_NOUNS.house;
    return (
      <ActionForm action={action} submit={`Gerar ${house.many.toLowerCase()}`} inline reset>
        <Field label="Do número" className="w-24"><Input name="from" type="number" min={0} required defaultValue={1} /></Field>
        <Field label="Até o número" className="w-28"><Input name="to" type="number" min={0} required /></Field>
        <Field label="Prefixo" className="w-24"><Input name="prefix" maxLength={8} placeholder="—" /></Field>
        <label className="flex h-10 items-center gap-2 text-sm text-fg-2">
          <input type="checkbox" name="pad" className="size-4 accent-[var(--brand)]" /> Zeros à esquerda (01, 02…)
        </label>
      </ActionForm>
    );
  }
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
