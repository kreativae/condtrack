import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { stripeConfigured, stripeDashboardUrl } from "@/lib/stripe";
import { ENTITLED, brl } from "@/lib/billing-shared";
import { Alert, Badge, Card, CardHeader, PageHeader } from "@/components/ui";
import { SyncPlansButton } from "../sync-all";
import { PlanForm } from "./plan-form";

export const metadata: Metadata = { title: "Planos" };

export default async function PlansPage() {
  await requireUser("superadmin");
  const dashboard = await stripeDashboardUrl("");
  const plans = await db.plan.findMany({ orderBy: { sortOrder: "asc" }, include: { subscriptions: { where: { status: { in: ENTITLED } }, select: { id: true } } } });
  return (
    <div className="animate-in">
      <Link href="/admin/assinaturas" className="mb-6 inline-flex items-center gap-2 text-xs font-medium text-muted hover:text-brand">
        <ArrowLeft className="size-3.5" /> Assinaturas
      </Link>
      <PageHeader
        eyebrow="Assinaturas"
        title="Planos e preços"
        description="Valores em BRL. Ao alterar um preço, o Stripe recebe um novo preço; assinaturas existentes continuam no valor antigo até trocarem de plano."
        actions={(await stripeConfigured()) && <SyncPlansButton />}
      />
      {!(await stripeConfigured()) && <div className="mb-6"><Alert tone="warn">Stripe não configurado — os planos são salvos só localmente por enquanto.</Alert></div>}
      <div className="grid gap-6 xl:grid-cols-3">
        {plans.map((p) => (
          <Card key={p.id}>
            <CardHeader
              title={p.name}
              subtitle={`${brl(p.monthlyPrice)}/mês · ${brl(p.yearlyPrice)}/ano · ${p.subscriptions.length} assinatura(s)`}
              action={p.stripeProductId ? (
                <a href={`${dashboard}products/${p.stripeProductId}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">
                  Stripe <ExternalLink className="size-3" />
                </a>
              ) : <Badge tone="warn">Não sincronizado</Badge>}
            />
            <div className="p-5"><PlanForm plan={p} /></div>
          </Card>
        ))}
      </div>
    </div>
  );
}
