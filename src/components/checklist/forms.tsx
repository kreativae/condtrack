"use client";

import { startTransition, useActionState, useState } from "react";
import { ArrowDown, ArrowUp, Pause, Play } from "lucide-react";
import type { ChecklistState } from "@/app/actions/checklist";
import { FREQUENCIES, WEEKDAYS, parseDays } from "@/lib/checklist";
import { ActionForm, DeleteButton } from "@/components/structure/forms";
import { Field, Input, Select, cx } from "@/components/ui";

type Action = (s: ChecklistState, f: FormData) => Promise<ChecklistState>;
type Item = { title: string; description: string | null; commonAreaId: string | null; frequency: string; weekdays: string };

/** Criar/editar item: nome, detalhe, área comum e frequência. */
export function ChecklistItemForm({ action, item, areas, submit }: { action: Action; item?: Item; areas: { id: string; name: string }[]; submit: string }) {
  const [freq, setFreq] = useState(item?.frequency ?? "daily");
  const [days, setDays] = useState<number[]>(() => parseDays(item?.weekdays ?? ""));
  const toggle = (d: number) => setDays((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d].sort()));
  return (
    <ActionForm action={action} submit={submit} reset={!item}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Item"><Input name="title" required maxLength={120} defaultValue={item?.title} placeholder="Ex.: Bombas d’água e reservatórios" /></Field>
        <Field label="Área comum (opcional)">
          <Select name="commonAreaId" defaultValue={item?.commonAreaId ?? ""}>
            <option value="">—</option>
            {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="O que conferir (opcional)"><Input name="description" maxLength={500} defaultValue={item?.description ?? ""} placeholder="Ex.: pressão, ruídos, nível da caixa" /></Field>
      <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
        <Field label="Frequência">
          <Select name="frequency" value={freq} onChange={(e) => setFreq(e.target.value)}>
            {Object.entries(FREQUENCIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </Field>
        {freq === "weekdays" && (
          <div>
            <p className="mb-1.5 text-[13px] font-medium text-fg-2">Dias</p>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map((l, d) => (
                <label key={d} className={cx("cursor-pointer rounded-lg px-2.5 py-2 text-xs font-medium ring-1 transition", days.includes(d) ? "bg-brand text-brand-ink ring-brand" : "text-fg-2 ring-line hover:bg-bg-2")}>
                  <input type="checkbox" name="weekdays" value={d} checked={days.includes(d)} onChange={() => toggle(d)} className="sr-only" />
                  {l}
                </label>
              ))}
            </div>
          </div>
        )}
        {freq === "weekly" && (
          <Field label="Dia da semana">
            <Select name="weekdays" defaultValue={String(parseDays(item?.weekdays ?? "")[0] ?? 1)}>
              {WEEKDAYS.map((l, d) => <option key={d} value={d}>{l}</option>)}
            </Select>
          </Field>
        )}
      </div>
    </ActionForm>
  );
}

/** Reordenar, pausar/reativar e excluir. */
export function ChecklistItemActions({ active, first, last, move, toggle, remove, title }: {
  active: boolean; first: boolean; last: boolean; title: string;
  move: (dir: -1 | 1) => Promise<void>;
  toggle: (s: ChecklistState) => Promise<ChecklistState>;
  remove: (s: ChecklistState) => Promise<ChecklistState>;
}) {
  const [, runToggle, toggling] = useActionState(toggle, undefined);
  const [moving, setMoving] = useState(false);
  const go = (d: -1 | 1) => {
    setMoving(true);
    startTransition(async () => {
      await move(d);
      setMoving(false);
    });
  };
  const btn = "rounded-lg p-1.5 text-muted transition hover:bg-bg-2 hover:text-fg disabled:opacity-30";
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <button type="button" disabled={first || moving} onClick={() => go(-1)} className={btn} aria-label="Subir"><ArrowUp className="size-4" /></button>
      <button type="button" disabled={last || moving} onClick={() => go(1)} className={btn} aria-label="Descer"><ArrowDown className="size-4" /></button>
      <button type="button" disabled={toggling} onClick={() => startTransition(() => runToggle())} className={btn} title={active ? "Pausar" : "Reativar"}>
        {active ? <Pause className="size-4" /> : <Play className="size-4" />}
      </button>
      <DeleteButton action={remove} confirmText={`Excluir “${title}”?`} />
    </div>
  );
}

export function ChecklistSettingsForm({ action, deadline }: { action: Action; deadline: string | null }) {
  return (
    <ActionForm action={action} submit="Salvar" inline>
      <Field label="Horário limite" hint="Vazio = sem alerta" className="w-40">
        <Input type="time" name="deadline" defaultValue={deadline ?? ""} />
      </Field>
    </ActionForm>
  );
}
