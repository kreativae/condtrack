"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import type { AssemblyState } from "@/app/actions/assembly";
import { useFormSubmit } from "@/components/use-form-submit";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Button, Field, Input, Select, Textarea } from "@/components/ui";
import { ASSEMBLY_KINDS, DEFAULT_OPTIONS } from "@/lib/assembly";

type Item = { key: number; id: string | null; title: string; description: string; options: string };
export type AssemblyInitial = {
  title: string; kind: string; description: string; location: string; meetingAt: string; votingEndsAt: string; showPartial: boolean;
  items: { id?: string; title: string; description: string; options: string[] }[];
};

let seq = 0;
const blank = (): Item => ({ key: ++seq, id: null, title: "", description: "", options: "" });

/**
 * `request`: superadmin editando assembleia publicada — vira pedido para o síndico aprovar.
 * `lockItems`: assembleia encerrada, a pauta não muda (só os dados).
 */
export function AssemblyForm({ action, initial, condominiumId, request, lockItems }: { action: (s: AssemblyState, f: FormData) => Promise<AssemblyState>; initial?: AssemblyInitial; condominiumId: string; request?: boolean; lockItems?: boolean }) {
  const [state, form, pending] = useFormSubmit(action);
  const [items, setItems] = useState<Item[]>(() =>
    initial?.items.length
      ? initial.items.map((i) => ({ key: ++seq, id: i.id ?? null, title: i.title, description: i.description, options: i.options.join("\n") === DEFAULT_OPTIONS.join("\n") ? "" : i.options.join("\n") }))
      : [{ ...blank(), title: "Prestação de contas do período" }, { ...blank(), title: "Previsão orçamentária do próximo período" }],
  );
  const set = (key: number, patch: Partial<Item>) => setItems((l) => l.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  const move = (idx: number, dir: -1 | 1) =>
    setItems((l) => {
      const n = [...l];
      const j = idx + dir;
      if (j < 0 || j >= n.length) return l;
      [n[idx], n[j]] = [n[j], n[idx]];
      return n;
    });

  return (
    <form {...form} className="space-y-6">
      <input type="hidden" name="condominiumId" value={condominiumId} />
      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <Field label="Título"><Input name="title" required minLength={3} maxLength={150} defaultValue={initial?.title} placeholder="Ex.: Assembleia geral ordinária 2026" /></Field>
        <Field label="Tipo">
          <Select name="kind" defaultValue={initial?.kind ?? "ordinary"}>
            {Object.entries(ASSEMBLY_KINDS).map(([k, v]) => <option key={k} value={k}>{v.replace("Assembleia geral ", "")}</option>)}
          </Select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Data e hora"><Input name="meetingAt" type="datetime-local" required defaultValue={initial?.meetingAt} /></Field>
        <Field label="Local"><Input name="location" maxLength={200} defaultValue={initial?.location} placeholder="Ex.: salão de festas" /></Field>
        <Field label="Votação online até" hint="Encerra sozinha nesse horário."><Input name="votingEndsAt" type="datetime-local" required defaultValue={initial?.votingEndsAt} /></Field>
      </div>
      <Field label="Edital / observações" hint="Aparece na convocação e no comunicado.">
        <Textarea name="description" rows={4} maxLength={4000} defaultValue={initial?.description} />
      </Field>

      <section>
        <h2 className="mb-1 font-display text-lg font-semibold">Pauta</h2>
        <p className="mb-3 text-xs text-muted">Cada item é votado por unidade. Opções padrão: {DEFAULT_OPTIONS.join(", ")}. Para outras (ex.: orçamentos A, B, C), escreva uma por linha.</p>
        <ol className="space-y-3">
          {items.map((it, idx) => (
            <li key={it.key} className="rounded-2xl p-4 ring-1 ring-line">
              <input type="hidden" name="itemId" value={it.id ?? ""} />
              <div className="flex gap-2">
                <span className="mt-2.5 w-6 shrink-0 font-num text-sm font-semibold text-brand">{idx + 1}.</span>
                <div className="min-w-0 flex-1 space-y-2">
                  <Input name="itemTitle" readOnly={lockItems} value={it.title} onChange={(e) => set(it.key, { title: e.target.value })} placeholder="Assunto a votar" maxLength={200} />
                  <Textarea name="itemDescription" readOnly={lockItems} rows={2} value={it.description} onChange={(e) => set(it.key, { description: e.target.value })} placeholder="Detalhes (opcional)" maxLength={2000} />
                  <Textarea name="itemOptions" readOnly={lockItems} rows={2} value={it.options} onChange={(e) => set(it.key, { options: e.target.value })} placeholder={`Opções, uma por linha (vazio = ${DEFAULT_OPTIONS.join(" / ")})`} />
                </div>
                <div className={lockItems ? "hidden" : "flex shrink-0 flex-col gap-1"}>
                  <button type="button" onClick={() => move(idx, -1)} disabled={idx === 0} aria-label="Subir" className="inline-flex size-8 items-center justify-center rounded-lg text-muted hover:bg-bg-2 disabled:opacity-30"><ArrowUp className="size-4" /></button>
                  <button type="button" onClick={() => move(idx, 1)} disabled={idx === items.length - 1} aria-label="Descer" className="inline-flex size-8 items-center justify-center rounded-lg text-muted hover:bg-bg-2 disabled:opacity-30"><ArrowDown className="size-4" /></button>
                  <button type="button" onClick={() => setItems((l) => l.filter((x) => x.key !== it.key))} aria-label="Remover item" className="inline-flex size-8 items-center justify-center rounded-lg text-muted hover:bg-bg-2 hover:text-bad"><X className="size-4" /></button>
                </div>
              </div>
            </li>
          ))}
        </ol>
        {lockItems ? (
          <p className="mt-2 text-xs text-muted">Assembleia encerrada: a pauta e o resultado não mudam.</p>
        ) : (
          <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => setItems((l) => [...l, blank()])}><Plus className="size-4" />Adicionar item</Button>
        )}
      </section>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="showPartial" defaultChecked={initial?.showPartial ?? false} className="mt-0.5 size-4 accent-[var(--brand)]" />
        <span>Mostrar o resultado parcial aos votantes <span className="block text-xs text-muted">Desligado: todos veem o resultado só depois do encerramento (o síndico acompanha sempre).</span></span>
      </label>

      {request && (
        <Field label="Motivo para o síndico" hint="O síndico vê o que muda e decide. Itens com votos que mudarem de texto ou opções terão os votos zerados.">
          <Textarea name="reason" rows={2} maxLength={500} placeholder="Ex.: corrigir a data da assembleia, que foi remarcada." />
        </Field>
      )}
      {state?.error && <Alert>{state.error}</Alert>}
      <div className="flex justify-end border-t border-line pt-5">
        <SubmitButton pending={pending} pendingText={request ? "Enviando…" : "Salvando…"}>{request ? "Enviar para aprovação do síndico" : "Salvar rascunho"}</SubmitButton>
      </div>
    </form>
  );
}
