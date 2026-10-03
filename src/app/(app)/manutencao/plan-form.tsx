"use client";

import { useState } from "react";
import type { PlanState } from "@/app/actions/maintenance";
import { useFormSubmit } from "@/components/use-form-submit";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Field, Input, Select, Textarea, cx } from "@/components/ui";
import { PLAN_KINDS, PLAN_UNITS, type PlanKind } from "@/lib/maintenance";
import { PRIORITY_META } from "@/lib/workflow";

type Opt = { id: string; name: string };
export type PlanInitial = {
  kind: string; title: string; description: string; categoryId: string | null; commonAreaId: string | null; providerId: string | null;
  priority: string; every: number; unit: string; nextDue: string; leadDays: number; active: boolean;
};

export function PlanForm({ action, initial, condominiumId, categories, areas, providers }: {
  action: (s: PlanState, f: FormData) => Promise<PlanState>;
  initial?: PlanInitial;
  condominiumId: string;
  categories: Opt[];
  areas: Opt[];
  providers: Opt[];
}) {
  const [state, form, pending] = useFormSubmit(action);
  const [kind, setKind] = useState<PlanKind>((initial?.kind as PlanKind) ?? "service");
  const doc = kind === "document";

  return (
    <form {...form} className="space-y-5">
      <input type="hidden" name="condominiumId" value={condominiumId} />
      <input type="hidden" name="kind" value={kind} />
      <div className="grid gap-2 sm:grid-cols-2">
        {(Object.keys(PLAN_KINDS) as PlanKind[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={cx("rounded-2xl px-4 py-3 text-left ring-1 transition", kind === k ? "bg-brand-soft ring-brand" : "ring-line-strong hover:bg-bg-2")}
          >
            <span className={cx("block text-sm font-semibold", kind === k && "text-brand")}>{PLAN_KINDS[k].label}</span>
            <span className="mt-0.5 block text-xs text-muted">{PLAN_KINDS[k].hint}</span>
          </button>
        ))}
      </div>

      <Field label={doc ? "Documento ou laudo" : "Serviço"}>
        <Input name="title" required minLength={2} maxLength={120} defaultValue={initial?.title} placeholder={doc ? "Ex.: AVCB, seguro predial, laudo do SPDA" : "Ex.: Limpeza da caixa d’água"} />
      </Field>
      <Field label="Descrição" hint={doc ? undefined : "Vai para a descrição da OS."}>
        <Textarea name="description" rows={3} maxLength={1000} defaultValue={initial?.description} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={doc ? "Vence em" : "Próxima data"}>
          <Input name="nextDue" type="date" required defaultValue={initial?.nextDue} />
        </Field>
        <Field label="Repetir a cada">
          <div className="flex gap-2">
            <Input name="every" type="number" min={1} max={60} required defaultValue={initial?.every ?? 1} className="w-20" />
            <Select name="unit" defaultValue={initial?.unit ?? "month"}>
              {Object.entries(PLAN_UNITS).map(([k, [one, many]]) => <option key={k} value={k}>{(initial?.every ?? 1) === 1 ? one : many}</option>)}
            </Select>
          </div>
        </Field>
        <Field label={doc ? "Avisar com antecedência" : "Abrir a OS com antecedência"} hint="Em dias.">
          <Input name="leadDays" type="number" min={0} max={365} required defaultValue={initial?.leadDays ?? (doc ? 30 : 7)} />
        </Field>
      </div>

      {!doc && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Prestador" hint="Opcional. Com prestador, a OS já sai atribuída a ele.">
            <Select name="providerId" defaultValue={initial?.providerId ?? ""}>
              <option value="">Escolher depois</option>
              {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label="Prioridade">
            <Select name="priority" defaultValue={initial?.priority ?? "medium"}>
              {Object.entries(PRIORITY_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>
          </Field>
          <Field label="Categoria">
            <Select name="categoryId" defaultValue={initial?.categoryId ?? ""}>
              <option value="">Sem categoria</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Local">
            <Select name="commonAreaId" defaultValue={initial?.commonAreaId ?? ""}>
              <option value="">Áreas comuns (geral)</option>
              {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </Field>
        </div>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={initial?.active ?? true} className="size-4 accent-[var(--brand)]" />
        Ativo {doc ? "(envia os avisos)" : "(abre as OS automaticamente)"}
      </label>

      {state?.error && <Alert>{state.error}</Alert>}
      <SubmitButton pending={pending} pendingText="Salvando…">Salvar</SubmitButton>
    </form>
  );
}
