"use client";

import { useActionState, useState } from "react";
import { Check } from "lucide-react";
import { startCheckout, switchPlan } from "@/app/actions/billing";
import { Alert, Badge, Card, buttonClass, cx } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { brl, TRIAL_DAYS, type Interval } from "@/lib/billing-shared";

export type PickerPlan = {
  id: string;
  name: string;
  description: string | null;
  maxUnits: number | null;
  monthlyPrice: number;
  yearlyPrice: number;
  features: string[];
};

type Props = {
  plans: PickerPlan[];
  units: number;
  current: { planId: string | null; interval: string } | null;
  /** Tem assinatura viva no Stripe → troca de plano; senão → Checkout. */
  hasLiveSubscription: boolean;
  trialAvailable: boolean;
  disabled?: boolean;
};

export function PlanPicker({ plans, units, current, hasLiveSubscription, trialAvailable, disabled }: Props) {
  const [interval, setInterval] = useState<Interval>((current?.interval as Interval) ?? "month");
  const recommended = plans.find((p) => p.maxUnits == null || units <= p.maxUnits)?.id;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="inline-flex rounded-xl bg-bg-2 p-1 text-sm">
          {(["month", "year"] as Interval[]).map((i) => (
            <button
              key={i}
              type="button"
              onClick={() => setInterval(i)}
              className={cx("rounded-lg px-4 py-1.5 font-medium transition", interval === i ? "bg-surface text-fg shadow-card" : "text-muted hover:text-fg")}
            >
              {i === "month" ? "Mensal" : "Anual"}
              {i === "year" && <span className="ml-1.5 rounded-full bg-ok/10 px-1.5 py-0.5 text-[10px] font-semibold text-ok">1 mês grátis</span>}
            </button>
          ))}
        </div>
        <p className="text-sm text-muted">Seu condomínio tem <b className="text-fg">{units}</b> unidades cadastradas.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((p) => {
          const price = interval === "month" ? p.monthlyPrice : p.yearlyPrice;
          const isCurrent = current?.planId === p.id && current.interval === interval && hasLiveSubscription;
          const tooSmall = p.maxUnits != null && units > p.maxUnits;
          return (
            <Card key={p.id} brand={isCurrent || (!hasLiveSubscription && p.id === recommended)} className="flex flex-col p-6">
              <div className="mb-4 flex items-center justify-between gap-2">
                <h3 className="font-display text-lg font-bold">{p.name}</h3>
                {isCurrent ? <Badge tone="brand">Plano atual</Badge> : !hasLiveSubscription && p.id === recommended ? <Badge tone="ok">Recomendado</Badge> : null}
              </div>
              <p className="font-num text-3xl font-bold tracking-tight">
                {brl(price)}
                <span className="ml-1 text-sm font-medium text-muted">/{interval === "month" ? "mês" : "ano"}</span>
              </p>
              <p className="mt-1 h-5 text-xs text-muted">{interval === "year" ? `equivale a ${brl(Math.round(p.yearlyPrice / 12))}/mês` : p.description}</p>
              <ul className="my-6 flex-1 space-y-2.5 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2.5 text-fg-2"><Check className="mt-0.5 size-4 shrink-0 text-brand" strokeWidth={2.4} />{f}</li>
                ))}
              </ul>
              {isCurrent ? (
                <p className="rounded-xl bg-bg-2 py-2.5 text-center text-sm font-medium text-muted">Seu plano atual</p>
              ) : tooSmall ? (
                <p className="rounded-xl bg-bg-2 py-2.5 text-center text-xs text-muted">Comporta até {p.maxUnits} unidades</p>
              ) : hasLiveSubscription ? (
                <SwitchButton planId={p.id} interval={interval} disabled={disabled} label={`Mudar para ${p.name}`} />
              ) : (
                <form action={startCheckout.bind(null, p.id, interval)}>
                  <SubmitButton className="w-full" disabled={disabled} pendingText="Abrindo checkout…">
                    {trialAvailable ? `Testar grátis por ${TRIAL_DAYS} dias` : "Assinar"}
                  </SubmitButton>
                </form>
              )}
            </Card>
          );
        })}
      </div>
      {!hasLiveSubscription && trialAvailable && (
        <p className="mt-4 text-center text-xs text-muted">Nenhuma cobrança durante o período de teste. Cancele quando quiser.</p>
      )}
    </div>
  );
}

function SwitchButton({ planId, interval, label, disabled }: { planId: string; interval: Interval; label: string; disabled?: boolean }) {
  const [state, action] = useActionState(switchPlan.bind(null, planId, interval), undefined);
  const [asking, setAsking] = useState(false);
  return (
    <div className="space-y-2">
      {asking ? (
        <form action={action} className="space-y-2 rounded-xl bg-bg-2 p-3">
          <p className="text-xs text-fg-2">A diferença será cobrada ou creditada proporcionalmente na próxima fatura.</p>
          <div className="flex gap-2">
            <SubmitButton className="flex-1" size="sm" pendingText="Alterando…">Confirmar troca</SubmitButton>
            <button type="button" onClick={() => setAsking(false)} className="rounded-lg px-3 text-xs font-medium text-fg-2 hover:bg-surface">Cancelar</button>
          </div>
        </form>
      ) : (
        <button type="button" disabled={disabled} onClick={() => setAsking(true)} className={buttonClass("outline") + " w-full"}>{label}</button>
      )}
      {state?.error && <Alert>{state.error}</Alert>}
      {state?.message && <Alert tone="ok">{state.message}</Alert>}
    </div>
  );
}
