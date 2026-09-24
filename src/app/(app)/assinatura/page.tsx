import type { Metadata } from "next";
import { AlertTriangle, CalendarClock, CreditCard, RefreshCw } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { stripe, stripeConfigured } from "@/lib/stripe";
import { syncCondominium } from "@/lib/billing";
import { ENTITLED, brl } from "@/lib/billing-shared";
import { fmtDate, nowMs } from "@/lib/format";
import { cancelMySubscription, openPortal, resumeMySubscription, syncMySubscription } from "@/app/actions/billing";
import { Alert, Card, CardHeader, PageHeader, buttonClass } from "@/components/ui";
import { InvoiceTable, SubscriptionBadge } from "@/components/billing/shared";
import { PlanPicker } from "./plan-picker";

export const metadata: Metadata = { title: "Assinatura" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function SubscriptionPage({ searchParams }: PageProps<"/assinatura">) {
  const user = await requireUser("syndic");
  const cid = user.condominiumId!;
  const sp = await searchParams;
  const configured = (await stripeConfigured());

  // Retorno do Checkout: sincroniza direto da API (não depende do webhook)
  let checkoutOk = false;
  const sessionId = one(sp.session_id);
  if (configured && one(sp.checkout) === "sucesso" && sessionId) {
    try {
      const session = await (await stripe()).checkout.sessions.retrieve(sessionId);
      if (session.metadata?.condominiumId === cid) {
        await syncCondominium(cid);
        checkoutOk = true;
      }
    } catch {}
  }

  const [sub, plans, units, invoices] = await Promise.all([
    db.subscription.findUnique({ where: { condominiumId: cid }, include: { plan: true } }),
    db.plan.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    db.unit.count({ where: { building: { condominiumId: cid } } }),
    db.payment.findMany({ where: { condominiumId: cid, status: { not: "draft" } }, orderBy: { createdAt: "desc" }, take: 24 }),
  ]);

  const live = !!sub?.stripeSubscriptionId && ENTITLED.includes(sub.status);
  const lastPaid = invoices.find((i) => i.status === "paid");
  const openInvoice = invoices.find((i) => i.status === "open");
  const trialDaysLeft = sub?.status === "trialing" && sub.trialEnd ? Math.max(0, Math.ceil((sub.trialEnd.getTime() - nowMs()) / 86400_000)) : null;
  const erro = one(sp.erro);

  return (
    <div className="animate-in">
      <PageHeader eyebrow={user.condominium?.name} title="Assinatura" description="Plano, pagamentos e faturas do Condtrack para o seu condomínio." />

      <div className="mb-6 space-y-3">
        {!configured && <Alert tone="warn">Os pagamentos ainda não foram habilitados nesta instalação. Fale com o suporte do Condtrack.</Alert>}
        {checkoutOk && <Alert tone="ok">Assinatura confirmada! Obrigado por escolher o Condtrack.</Alert>}
        {one(sp.checkout) === "cancelado" && <Alert tone="muted">Checkout cancelado — nenhuma cobrança foi feita.</Alert>}
        {erro && erro !== "stripe" && <Alert>{erro}</Alert>}
        {sub && ["past_due", "unpaid"].includes(sub.status) && (
          <Alert tone="bad">
            <span className="flex items-center gap-2"><AlertTriangle className="size-4" />Não conseguimos processar o último pagamento. Atualize a forma de pagamento para evitar a suspensão.</span>
          </Alert>
        )}
      </div>

      {live && sub && (
        <div className="mb-10 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <Card className="p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm text-muted">Plano atual</p>
                <p className="mt-1 font-display text-2xl font-bold">{sub.plan?.name ?? "—"}</p>
                <p className="mt-1 text-sm text-fg-2">
                  {brl(sub.unitAmount)} / {sub.interval === "year" ? "ano" : "mês"}
                </p>
              </div>
              <SubscriptionBadge status={sub.status} />
            </div>

            <dl className="mt-6 grid gap-4 border-t border-line pt-5 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted">{sub.cancelAtPeriodEnd ? "Acesso até" : trialDaysLeft != null ? "Teste termina em" : "Próxima cobrança"}</dt>
                <dd className="mt-1 flex items-center gap-1.5 font-medium"><CalendarClock className="size-4 text-brand" />{fmtDate(trialDaysLeft != null ? sub.trialEnd : sub.currentPeriodEnd)}</dd>
                {trialDaysLeft != null && <dd className="text-xs text-muted">{trialDaysLeft} dia(s) restantes</dd>}
              </div>
              <div>
                <dt className="text-xs text-muted">Último pagamento</dt>
                <dd className="mt-1 font-medium">{lastPaid ? `${brl(lastPaid.amountPaid)} · ${fmtDate(lastPaid.paidAt)}` : "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Forma de pagamento</dt>
                <dd className="mt-1 flex items-center gap-1.5 font-medium capitalize">
                  <CreditCard className="size-4 text-brand" />
                  {sub.paymentMethodLast4 ? `${sub.paymentMethodBrand} •••• ${sub.paymentMethodLast4}` : sub.paymentMethodBrand ?? "Não informada"}
                </dd>
              </div>
            </dl>

            {sub.cancelAtPeriodEnd && (
              <div className="mt-5 rounded-xl bg-warn/10 px-4 py-3 text-sm text-warn">
                A assinatura será encerrada em {fmtDate(sub.currentPeriodEnd)}. Você pode reativá-la até lá sem custo.
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Gerenciar" />
            <div className="space-y-2 p-5">
              <form action={openPortal}>
                <button className={buttonClass("brand") + " w-full"}><CreditCard className="size-4" />Forma de pagamento e dados de cobrança</button>
              </form>
              {openInvoice?.hostedInvoiceUrl && (
                <a href={openInvoice.hostedInvoiceUrl} target="_blank" rel="noreferrer" className={buttonClass("outline") + " w-full"}>
                  Pagar fatura em aberto ({brl(openInvoice.amountDue)})
                </a>
              )}
              {sub.cancelAtPeriodEnd ? (
                <form action={resumeMySubscription}><button className={buttonClass("success") + " w-full"}>Reativar assinatura</button></form>
              ) : (
                <details className="group rounded-xl border border-line px-4 py-3 text-sm">
                  <summary className="cursor-pointer list-none text-muted hover:text-bad">Cancelar assinatura…</summary>
                  <p className="mt-3 text-xs text-muted">O acesso continua até {fmtDate(sub.currentPeriodEnd)}. Não há reembolso proporcional.</p>
                  <form action={cancelMySubscription} className="mt-3"><button className={buttonClass("danger", "sm")}>Confirmar cancelamento</button></form>
                </details>
              )}
              <form action={syncMySubscription}>
                <button className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted hover:text-fg"><RefreshCw className="size-3" />Atualizar dados</button>
              </form>
            </div>
          </Card>
        </div>
      )}

      <section className="mb-10">
        <h2 className="mb-1 font-display text-xl font-semibold">{live ? "Trocar de plano" : "Escolha seu plano"}</h2>
        <p className="mb-6 text-sm text-muted">{live ? "Upgrades e downgrades são cobrados ou creditados proporcionalmente." : "Todos os planos incluem os perfis de síndico, zelador, prestadores, conselho e moradores."}</p>
        <PlanPicker
          plans={plans.map((p) => ({ id: p.id, name: p.name, description: p.description, maxUnits: p.maxUnits, monthlyPrice: p.monthlyPrice, yearlyPrice: p.yearlyPrice, features: JSON.parse(p.features) }))}
          units={units}
          current={sub ? { planId: sub.planId, interval: sub.interval } : null}
          hasLiveSubscription={live}
          trialAvailable={!sub?.hadTrial}
          disabled={!configured}
        />
      </section>

      <section>
        <h2 className="mb-4 font-display text-xl font-semibold">Histórico de faturas</h2>
        <InvoiceTable invoices={invoices} scroll />
      </section>
    </div>
  );
}
