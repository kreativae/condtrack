"use client";

import { useState } from "react";
import { useFormSubmit } from "@/components/use-form-submit";
import { saveDeal } from "@/app/actions/billing";
import { Alert, Field, Input, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { brl } from "@/lib/billing-shared";
import { centsToInput, parseBRL } from "@/lib/finance";

type Deal = { monthlyUnitPrice: number; yearlyUnitPrice: number; minUnits: number; trialDays: number; notes: string | null; active: boolean } | null;

/** Negociação especial: preço por unidade (mensal e anual), mínimo e teste, com a conta ao vivo. */
export function DealForm({ condominiumId, deal, units, live }: { condominiumId: string; deal: Deal; units: number; live: boolean }) {
  const [state, form, pending] = useFormSubmit(saveDeal.bind(null, condominiumId));
  const [monthly, setMonthly] = useState(deal ? centsToInput(deal.monthlyUnitPrice) : "");
  const [yearly, setYearly] = useState(deal ? centsToInput(deal.yearlyUnitPrice) : "");
  const [min, setMin] = useState(String(deal?.minUnits ?? 0));
  const m = parseBRL(monthly) ?? 0;
  const y = parseBRL(yearly) ?? 0;
  const billable = Math.max(units, Number(min) || 0, 1);
  const saving = m && y ? 12 * m * billable - y * billable : 0;

  return (
    <form {...form} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Valor mensal por unidade (R$)"><Input name="monthly" inputMode="decimal" required value={monthly} onChange={(e) => setMonthly(e.target.value)} placeholder="2,00" className="font-num" /></Field>
        <Field label="Valor anual por unidade (R$)"><Input name="yearly" inputMode="decimal" required value={yearly} onChange={(e) => setYearly(e.target.value)} placeholder="20,00" className="font-num" /></Field>
        <Field label="Mínimo de unidades cobradas" hint="Cobra pelas unidades cadastradas, nunca menos que isso."><Input name="minUnits" type="number" min={0} value={min} onChange={(e) => setMin(e.target.value)} /></Field>
        <Field label="Dias de teste grátis" hint="Só na primeira assinatura. 0 = sem teste."><Input name="trialDays" type="number" min={0} max={90} defaultValue={deal?.trialDays ?? 0} /></Field>
      </div>
      <Field label="Observações internas"><Textarea name="notes" rows={2} maxLength={1000} defaultValue={deal?.notes ?? ""} placeholder="Ex.: Condições combinadas com o síndico em reunião de 02/10." /></Field>

      {/* Conta ao vivo */}
      <div className="rounded-xl bg-bg-2 px-4 py-3 text-sm">
        <p className="text-fg-2">
          <b className="text-fg">{billable}</b> unidade(s) cobrada(s) <span className="text-muted">({units} cadastrada(s){billable > units ? `, mínimo ${billable}` : ""})</span>
        </p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <p><span className="text-muted">Mensal:</span> {brl(m)} × {billable} = <b className="font-num">{brl(m * billable)}</b>/mês</p>
          <p><span className="text-muted">Anual:</span> {brl(y)} × {billable} = <b className="font-num">{brl(y * billable)}</b>/ano</p>
        </div>
        {saving > 0 && <p className="mt-1 text-xs text-ok">No anual, o condomínio economiza {brl(saving)} por ano.</p>}
        {saving < 0 && <p className="mt-1 text-xs text-warn">Atenção: o anual sai mais caro que 12 mensalidades.</p>}
      </div>

      <label className="flex items-start gap-3 rounded-xl border border-line px-4 py-3 text-sm">
        <input type="checkbox" name="active" value="1" defaultChecked={deal?.active ?? true} className="mt-0.5 size-4 accent-[var(--brand)]" />
        <span><span className="block font-medium">Negociação ativa</span><span className="block text-xs text-muted">Ativa, o síndico vê só esta proposta na tela Assinatura (os planos padrão somem).</span></span>
      </label>
      {live && (
        <label className="flex items-start gap-3 rounded-xl border border-warn/30 bg-warn/5 px-4 py-3 text-sm">
          <input type="checkbox" name="apply" value="1" className="mt-0.5 size-4 accent-[var(--brand)]" />
          <span><span className="block font-medium">Aplicar agora na assinatura atual</span><span className="block text-xs text-muted">Troca o preço da assinatura em andamento por este (mantém mensal/anual), com cobrança ou crédito proporcional.</span></span>
        </label>
      )}
      {state?.error && <Alert>{state.error}</Alert>}
      {state?.message && <Alert tone="ok">{state.message}</Alert>}
      <SubmitButton pending={pending} className="w-full" pendingText="Salvando…">{deal ? "Salvar negociação" : "Criar negociação"}</SubmitButton>
    </form>
  );
}
