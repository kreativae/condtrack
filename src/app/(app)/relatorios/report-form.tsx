"use client";

import { useState } from "react";
import { FileText } from "lucide-react";
import { Field, Input, Select, buttonClass } from "@/components/ui";

type Preset = { key: string; label: string };

/** Escolha do período; o relatório abre numa nova aba, pronto para salvar em PDF. */
export function ReportForm({ presets, condos, today }: { presets: readonly Preset[]; condos: { id: string; name: string }[] | null; today: string }) {
  const [periodo, setPeriodo] = useState("mes-anterior");
  const custom = periodo === "personalizado";
  return (
    <form action="/relatorio" target="_blank" className="space-y-5 p-5 sm:p-6">
      {condos && (
        <Field label="Condomínio">
          <Select name="condo" required defaultValue="">
            <option value="" disabled>Selecione…</option>
            {condos.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
      )}
      <Field label="Período">
        <Select name="periodo" value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
          {presets.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
        </Select>
      </Field>
      {custom && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="De"><Input type="date" name="de" required max={today} /></Field>
          <Field label="Até"><Input type="date" name="ate" required max={today} defaultValue={today} /></Field>
        </div>
      )}
      <label className="flex items-start gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3">
        <input type="checkbox" name="fotos" value="1" defaultChecked className="mt-0.5 size-4 accent-[var(--brand)]" />
        <span>
          <span className="block text-sm font-medium">Incluir fotos de antes e depois</span>
          <span className="block text-xs text-muted">Desmarque para um relatório mais curto, só com textos e números.</span>
        </span>
      </label>
      <label className="flex items-start gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3">
        <input type="checkbox" name="pendencias" value="1" defaultChecked className="mt-0.5 size-4 accent-[var(--brand)]" />
        <span>
          <span className="block text-sm font-medium">Incluir serviços em aberto</span>
          <span className="block text-xs text-muted">Lista do que ainda está em andamento, com prazos e atrasos (situação de hoje).</span>
        </span>
      </label>
      <button className={buttonClass("brand")}><FileText className="size-4" />Gerar relatório</button>
    </form>
  );
}
