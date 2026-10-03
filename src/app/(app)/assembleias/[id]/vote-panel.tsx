"use client";

import { useState } from "react";
import { castVote, type AssemblyState } from "@/app/actions/assembly";
import { useFormSubmit } from "@/components/use-form-submit";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Card, CardHeader, cx } from "@/components/ui";

type Item = { id: string; title: string; description: string; options: string[] };

/** Cédula: o proprietário escolhe a unidade (se tiver mais de uma) e vota em cada item. */
export function VotePanel({ id, units, items, mine }: { id: string; units: { id: string; label: string }[]; items: Item[]; mine: Record<string, Record<string, number>> }) {
  const [unit, setUnit] = useState(units[0].id);
  const [state, form, pending] = useFormSubmit((p: AssemblyState, f: FormData) => castVote(id, p, f));
  const current = mine[unit] ?? {};
  const votedAll = items.every((i) => current[i.id] != null);

  return (
    <Card brand>
      <CardHeader title="Seu voto" subtitle={votedAll ? "Voto registrado. Você pode mudar até o fim da votação." : "Um voto por unidade em cada item. Dá para mudar até o encerramento."} />
      <form {...form} key={unit} className="space-y-5 p-5">
        <input type="hidden" name="unitId" value={unit} />
        {units.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {units.map((u) => (
              <button key={u.id} type="button" onClick={() => setUnit(u.id)} className={cx("rounded-xl px-3 py-1.5 text-sm ring-1", u.id === unit ? "bg-brand-soft font-medium text-brand ring-brand" : "ring-line-strong hover:bg-bg-2")}>
                {u.label}{Object.keys(mine[u.id] ?? {}).length > 0 && " ✓"}
              </button>
            ))}
          </div>
        )}
        {items.map((it, n) => (
          <fieldset key={it.id}>
            <legend className="mb-2 text-sm font-medium"><span className="mr-1.5 font-num text-brand">{n + 1}.</span>{it.title}</legend>
            <div className="flex flex-wrap gap-2">
              {it.options.map((o, i) => (
                <label key={i} className="cursor-pointer">
                  <input type="radio" name={`item_${it.id}`} value={i} defaultChecked={current[it.id] === i} className="peer sr-only" />
                  <span className="inline-flex rounded-xl px-3.5 py-2 text-sm ring-1 ring-line-strong transition hover:bg-bg-2 peer-checked:bg-brand peer-checked:text-white peer-checked:ring-brand peer-focus-visible:outline-2 peer-focus-visible:outline-brand">{o}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        {state?.error && <Alert>{state.error}</Alert>}
        {state?.message && <Alert tone="ok">{state.message}</Alert>}
        <SubmitButton pending={pending} pendingText="Registrando…">{votedAll ? "Atualizar voto" : "Votar"}{units.length > 1 && ` (${units.find((u) => u.id === unit)?.label})`}</SubmitButton>
      </form>
    </Card>
  );
}
