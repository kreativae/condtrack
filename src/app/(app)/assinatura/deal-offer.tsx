"use client";

import { useActionState, useState } from "react";
import { Check, Handshake } from "lucide-react";
import { startDealCheckout, switchDealInterval } from "@/app/actions/billing";
import { Alert, Badge, Card, cx } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { brl, type Interval } from "@/lib/billing-shared";

type Props = {
  monthlyUnit: number;
  yearlyUnit: number;
  units: number;
  billable: number;
  trialDays: number;
  live: boolean;
  currentInterval: string | null;
  disabled?: boolean;
};

/** Proposta da negociação especial para o síndico: preço por unidade, conta e assinatura. */
export function DealOffer({ monthlyUnit, yearlyUnit, units, billable, trialDays, live, currentInterval, disabled }: Props) {
  const [interval, setInterval] = useState<Interval>((currentInterval as Interval) ?? "month");
  const [state, switchAction, switching] = useActionState(switchDealInterval, undefined);
  const unit = interval === "month" ? monthlyUnit : yearlyUnit;
  const total = unit * billable;
  const saving = 12 * monthlyUnit * billable - yearlyUnit * billable;
  const isCurrent = live && currentInterval === interval;

  return (
    <Card brand className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-6 py-4">
        <span className="flex size-9 items-center justify-center rounded-xl bg-brand-soft text-brand"><Handshake className="size-5" /></span>
        <div className="mr-auto">
          <p className="font-display text-lg font-semibold">Negociação especial</p>
          <p className="text-xs text-muted">Condição combinada para o seu condomínio, cobrada por unidade.</p>
        </div>
        <div className="inline-flex rounded-xl bg-bg-2 p-1 text-sm">
          {(["month", "year"] as Interval[]).map((i) => (
            <button key={i} type="button" onClick={() => setInterval(i)} className={cx("rounded-lg px-4 py-1.5 font-medium transition", interval === i ? "bg-surface text-fg shadow-card" : "text-muted hover:text-fg")}>
              {i === "month" ? "Mensal" : "Anual"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-6 p-6 md:grid-cols-[1fr_auto] md:items-end">
        <div className="space-y-3">
          <p className="font-num text-4xl font-bold tracking-tight">
            {brl(total)}<span className="text-base font-medium text-muted"> / {interval === "month" ? "mês" : "ano"}</span>
          </p>
          <p className="text-sm text-fg-2">
            {brl(unit)} por unidade × <b>{billable}</b> unidade(s)
            {billable > units && <span className="text-muted"> (mínimo combinado; {units} cadastrada(s))</span>}
          </p>
          <ul className="space-y-1.5 text-sm text-fg-2">
            <li className="flex items-center gap-2"><Check className="size-4 text-ok" />Todos os perfis e recursos do Condtrack</li>
            <li className="flex items-center gap-2"><Check className="size-4 text-ok" />O valor acompanha as unidades cadastradas</li>
            {interval === "year" && saving > 0 && <li className="flex items-center gap-2"><Check className="size-4 text-ok" />No anual, economia de {brl(saving)} por ano</li>}
            {!live && trialDays > 0 && <li className="flex items-center gap-2"><Check className="size-4 text-ok" />{trialDays} dias de teste grátis antes da primeira cobrança</li>}
          </ul>
        </div>

        <div className="md:w-56">
          {isCurrent ? (
            <Badge tone="ok" dot className="w-full justify-center py-2 text-sm">Sua assinatura atual</Badge>
          ) : live ? (
            <form action={switchAction}>
              <input type="hidden" name="interval" value={interval} />
              <SubmitButton pending={switching} pendingText="Alterando…" className="w-full">Mudar para {interval === "month" ? "mensal" : "anual"}</SubmitButton>
              <p className="mt-2 text-center text-[11px] text-muted">Cobrança ou crédito proporcional.</p>
            </form>
          ) : (
            <form action={startDealCheckout.bind(null, interval)}>
              <SubmitButton disabled={disabled} pendingText="Abrindo pagamento…" className="w-full">Assinar {interval === "month" ? "mensal" : "anual"}</SubmitButton>
              <p className="mt-2 text-center text-[11px] text-muted">Pagamento seguro pelo Stripe.</p>
            </form>
          )}
        </div>
      </div>
      {state?.error && <div className="px-6 pb-5"><Alert>{state.error}</Alert></div>}
      {state?.ok && <div className="px-6 pb-5"><Alert tone="ok">{state.message}</Alert></div>}
    </Card>
  );
}
