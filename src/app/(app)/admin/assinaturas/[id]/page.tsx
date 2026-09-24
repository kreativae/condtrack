import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ExternalLink, RefreshCw } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { stripeDashboardUrl } from "@/lib/stripe";
import { ENTITLED, brl } from "@/lib/billing-shared";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { adminSetCancel, adminSync } from "@/app/actions/billing";
import { InvoiceTable, SubscriptionBadge } from "@/components/billing/shared";
import { Card, CardHeader, PageHeader, Stat, buttonClass } from "@/components/ui";
import { AdminPlanForm } from "./admin-plan-form";

export const metadata: Metadata = { title: "Assinatura do condomínio" };

export default async function CondoBillingPage({ params }: PageProps<"/admin/assinaturas/[id]">) {
  await requireUser("superadmin");
  const { id } = await params;
  const condo = await db.condominium.findUnique({
    where: { id },
    include: { subscription: { include: { plan: true } }, users: { where: { role: "syndic" }, select: { name: true, email: true } } },
  });
  if (!condo) notFound();
  const [invoices, plans, units] = await Promise.all([
    db.payment.findMany({ where: { condominiumId: id, status: { not: "draft" } }, orderBy: { createdAt: "desc" } }),
    db.plan.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    db.unit.count({ where: { building: { condominiumId: id } } }),
  ]);
  const s = condo.subscription;
  const stripeCustomerUrl = s?.stripeCustomerId ? await stripeDashboardUrl(`customers/${s.stripeCustomerId}`) : null;
  const live = !!s?.stripeSubscriptionId && ENTITLED.includes(s.status);
  const totalPaid = invoices.filter((i) => i.status === "paid").reduce((a, i) => a + i.amountPaid, 0);
  const lastPaid = invoices.find((i) => i.status === "paid");

  return (
    <div className="animate-in">
      <Link href="/admin/assinaturas" className="mb-6 inline-flex items-center gap-2 text-xs font-medium text-muted hover:text-brand">
        <ArrowLeft className="size-3.5" /> Assinaturas
      </Link>
      <PageHeader
        eyebrow="Assinatura"
        title={condo.name}
        description={`${units} unidades · Síndico: ${condo.users.map((u) => `${u.name} (${u.email})`).join(", ") || "—"}`}
        actions={
          <>
            {s?.stripeCustomerId && (
              <a href={stripeCustomerUrl!} target="_blank" rel="noreferrer" className={buttonClass("outline")}>
                Abrir no Stripe <ExternalLink className="size-3.5" />
              </a>
            )}
            {s?.stripeCustomerId && (
              <form action={adminSync.bind(null, id)}><button className={buttonClass("outline")}><RefreshCw className="size-4" />Sincronizar</button></form>
            )}
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="p-5">
          <p className="text-[13px] font-medium text-muted">Status</p>
          <div className="mt-3"><SubscriptionBadge status={s?.stripeSubscriptionId ? s.status : "none"} /></div>
          {s?.cancelAtPeriodEnd && <p className="mt-2 text-xs text-warn">Cancela em {fmtDate(s.currentPeriodEnd)}</p>}
        </Card>
        <Stat label="Plano" value={s?.plan?.name ?? "—"} hint={s?.unitAmount ? `${brl(s.unitAmount)} / ${s.interval === "year" ? "ano" : "mês"}` : undefined} />
        <Stat label="Último pagamento" value={lastPaid ? brl(lastPaid.amountPaid) : "—"} hint={lastPaid ? fmtDate(lastPaid.paidAt) : undefined} />
        <Stat label="Total recebido" value={brl(totalPaid)} tone="ok" />
      </div>

      <div className="mb-8 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader title="Detalhes" />
          <dl className="grid gap-4 p-5 text-sm sm:grid-cols-2">
            {[
              ["Início do período", fmtDate(s?.currentPeriodStart)],
              ["Fim do período / próxima cobrança", fmtDate(s?.currentPeriodEnd)],
              ["Fim do teste", fmtDate(s?.trialEnd)],
              ["Forma de pagamento", s?.paymentMethodLast4 ? `${s.paymentMethodBrand} •••• ${s.paymentMethodLast4}` : s?.paymentMethodBrand ?? "—"],
              ["Cliente Stripe", s?.stripeCustomerId ?? "—"],
              ["Assinatura Stripe", s?.stripeSubscriptionId ?? "—"],
              ["Cancelada em", fmtDate(s?.canceledAt)],
              ["Última sincronização", fmtDateTime(s?.syncedAt)],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-muted">{k}</dt>
                <dd className="mt-0.5 break-all font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <Card>
          <CardHeader title="Ações" subtitle={live ? "Alterações aplicadas direto no Stripe" : "O síndico assina pela tela Assinatura do condomínio"} />
          <div className="space-y-4 p-5">
            {live && s ? (
              <>
                <AdminPlanForm condominiumId={id} plans={plans} planId={s.planId} interval={s.interval} />
                <form action={adminSetCancel.bind(null, id, !s.cancelAtPeriodEnd)} className="border-t border-line pt-4">
                  <button className={buttonClass(s.cancelAtPeriodEnd ? "success" : "danger") + " w-full"}>
                    {s.cancelAtPeriodEnd ? "Reverter cancelamento" : "Cancelar no fim do período"}
                  </button>
                </form>
              </>
            ) : (
              <p className="text-sm text-muted">Sem assinatura ativa. Assim que o síndico concluir o checkout, ela aparecerá aqui.</p>
            )}
          </div>
        </Card>
      </div>

      <h2 className="mb-4 font-display text-xl font-semibold">Faturas</h2>
      <InvoiceTable invoices={invoices} scroll />
    </div>
  );
}
