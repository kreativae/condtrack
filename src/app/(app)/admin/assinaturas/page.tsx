import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Settings2 } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { stripeConfigured, stripeWebhookSecret } from "@/lib/stripe";
import { ENTITLED, PAYING, brl, monthlyEquivalent } from "@/lib/billing-shared";
import { fmtDate, nowMs } from "@/lib/format";
import { MonthBars, RankBars } from "@/components/charts";
import { InvoiceTable, SubscriptionBadge } from "@/components/billing/shared";
import { Alert, Card, CardHeader, LinkButton, PageHeader, Stat, cx } from "@/components/ui";
import { stickyHead } from "@/components/frozen";
import { SyncAllButton } from "./sync-all";

export const metadata: Metadata = { title: "Assinaturas" };

export default async function BillingAdminPage({ searchParams }: PageProps<"/admin/assinaturas">) {
  await requireUser("superadmin");
  const { status: filter } = await searchParams;
  const since12 = new Date(new Date().getFullYear(), new Date().getMonth() - 11, 1);

  const [condos, paid12, recent] = await Promise.all([
    db.condominium.findMany({
      include: {
        subscription: { include: { plan: true } },
        payments: { where: { status: { in: ["paid", "open", "uncollectible"] } }, orderBy: { createdAt: "desc" }, take: 1 },
        _count: { select: { buildings: true } },
      },
      orderBy: { name: "asc" },
    }),
    db.payment.findMany({ where: { status: "paid", paidAt: { gte: since12 } }, select: { amountPaid: true, paidAt: true } }),
    db.payment.findMany({ where: { status: { not: "draft" } }, include: { condominium: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);

  const subs = condos.map((c) => c.subscription).filter((s): s is NonNullable<typeof s> => !!s);
  const statusOf = (c: (typeof condos)[number]) => c.subscription?.stripeSubscriptionId ? c.subscription.status : "none";
  const mrr = subs.filter((s) => PAYING.includes(s.status) && !s.cancelAtPeriodEnd).reduce((a, s) => a + monthlyEquivalent(s.unitAmount ?? 0, s.interval), 0);
  const trialMrr = subs.filter((s) => s.status === "trialing").reduce((a, s) => a + monthlyEquivalent(s.unitAmount ?? 0, s.interval), 0);
  const count = (st: string[]) => condos.filter((c) => st.includes(statusOf(c))).length;
  const last30 = paid12.filter((p) => p.paidAt! > new Date(nowMs() - 30 * 86400_000)).reduce((a, p) => a + p.amountPaid, 0);

  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(since12.getFullYear(), since12.getMonth() + i, 1);
    const value = paid12.filter((p) => p.paidAt!.getFullYear() === d.getFullYear() && p.paidAt!.getMonth() === d.getMonth()).reduce((a, p) => a + p.amountPaid, 0);
    return { name: new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(d).replace(".", ""), value };
  });
  const byPlan = Object.values(
    subs.filter((s) => ENTITLED.includes(s.status)).reduce<Record<string, { name: string; value: number }>>((acc, s) => {
      const n = s.plan?.name ?? "Sem plano";
      acc[n] = { name: n, value: (acc[n]?.value ?? 0) + 1 };
      return acc;
    }, {}),
  );

  const f = typeof filter === "string" ? filter : "";
  const groups: Record<string, string[]> = { pagantes: ["active"], teste: ["trialing"], inadimplentes: ["past_due", "unpaid"], cancelados: ["canceled", "incomplete_expired"], sem: ["none", "incomplete"] };
  const list = f && groups[f] ? condos.filter((c) => groups[f].includes(statusOf(c))) : condos;

  return (
    <div className="animate-in">
      <PageHeader
        eyebrow="Superadministração"
        title="Assinaturas e receita"
        description="Recorrência via Stripe de todos os condomínios da plataforma."
        actions={
          <>
            <LinkButton href="/admin/assinaturas/planos" variant="outline"><Settings2 className="size-4" />Planos</LinkButton>
            <SyncAllButton />
          </>
        }
      />
      {!(await stripeConfigured()) && <div className="mb-6"><Alert tone="warn">Stripe não configurado. Informe as chaves em Configurações → Stripe. Os dados abaixo refletem o último estado sincronizado.</Alert></div>}
      {(await stripeConfigured()) && !(await stripeWebhookSecret()) && (
        <div className="mb-6"><Alert tone="warn">Segredo do webhook não definido (Configurações → Stripe) — renovações e falhas de pagamento só aparecem ao sincronizar manualmente.</Alert></div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="MRR" value={brl(mrr)} tone="brand" hint={trialMrr ? `+ ${brl(trialMrr)} em teste` : undefined} />
        <Stat label="ARR" value={brl(mrr * 12)} />
        <Stat label="Recebido (30 dias)" value={brl(last30)} tone="ok" />
        <Stat label="Ticket médio" value={brl(count(PAYING) ? Math.round(mrr / count(PAYING)) : 0)} />
      </div>

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {([
          ["pagantes", "Pagantes", count(["active"]), "text-ok"],
          ["teste", "Em teste", count(["trialing"]), "text-info"],
          ["inadimplentes", "Inadimplentes", count(["past_due", "unpaid"]), "text-bad"],
          ["cancelados", "Cancelados", count(["canceled", "incomplete_expired"]), "text-muted"],
          ["sem", "Sem assinatura", count(["none", "incomplete"]), "text-muted"],
        ] as const).map(([k, label, n, color]) => (
          <Link key={k} href={f === k ? "/admin/assinaturas" : `/admin/assinaturas?status=${k}`} className={cx("rounded-2xl border bg-surface px-4 py-3 shadow-card transition hover:border-line-strong", f === k ? "border-brand/40" : "border-line")}>
            <p className="text-xs font-medium text-muted">{label}</p>
            <p className={cx("mt-1 font-num text-xl font-bold", color)}>{n}</p>
          </Link>
        ))}
      </div>

      <div className="mb-8 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader title="Receita recebida" subtitle="Faturas pagas nos últimos 12 meses" />
          <div className="p-4"><MonthBars data={months} /></div>
        </Card>
        <Card>
          <CardHeader title="Condomínios por plano" subtitle="Assinaturas ativas e em teste" />
          <div className="p-4"><RankBars data={byPlan} /></div>
        </Card>
      </div>

      <section className="mb-8">
        <h2 className="mb-4 font-display text-xl font-semibold">Condomínios {f && <span className="text-sm font-medium text-muted">· filtro ativo</span>}</h2>
        <Card className="max-h-[32rem] overflow-auto overscroll-contain">
          <table className="w-full min-w-[860px] text-sm">
            <thead className={`${stickyHead} text-left text-xs font-medium text-muted`}>
              <tr>
                <th className="px-5 py-3 font-medium">Condomínio</th>
                <th className="px-5 py-3 font-medium">Plano</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 text-right font-medium">MRR</th>
                <th className="px-5 py-3 font-medium">Próxima cobrança</th>
                <th className="px-5 py-3 font-medium">Último pagamento</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {list.map((c) => {
                const s = c.subscription;
                const st = statusOf(c);
                const last = c.payments[0];
                return (
                  <tr key={c.id} className="group">
                    <td className="px-5 py-3">
                      <Link href={`/admin/assinaturas/${c.id}`} className="font-medium hover:text-brand">{c.name}</Link>
                      {!c.active && <p className="text-xs text-muted">Condomínio inativo</p>}
                    </td>
                    <td className="px-5 py-3">{s?.plan ? `${s.plan.name} · ${s.interval === "year" ? "anual" : "mensal"}` : "—"}</td>
                    <td className="px-5 py-3">
                      <SubscriptionBadge status={st} />
                      {s?.cancelAtPeriodEnd && st !== "canceled" && <p className="mt-1 text-[11px] text-warn">Cancela em {fmtDate(s.currentPeriodEnd)}</p>}
                    </td>
                    <td className="px-5 py-3 text-right font-num tabular-nums">{s && PAYING.includes(s.status) ? brl(monthlyEquivalent(s.unitAmount ?? 0, s.interval)) : "—"}</td>
                    <td className="px-5 py-3 text-xs">{s && ENTITLED.includes(s.status) && !s.cancelAtPeriodEnd ? fmtDate(s.status === "trialing" ? s.trialEnd : s.currentPeriodEnd) : "—"}</td>
                    <td className="px-5 py-3 text-xs">
                      {last ? (
                        <span className={last.status === "paid" ? "" : "text-bad"}>
                          {brl(last.status === "paid" ? last.amountPaid : last.amountDue)} · {last.status === "paid" ? fmtDate(last.paidAt) : "não pago"}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="pr-4"><Link href={`/admin/assinaturas/${c.id}`} aria-label="Detalhes"><ChevronRight className="size-4 text-muted group-hover:text-brand" /></Link></td>
                  </tr>
                );
              })}
              {!list.length && <tr><td colSpan={7} className="px-5 py-10 text-center text-muted">Nenhum condomínio neste filtro.</td></tr>}
            </tbody>
          </table>
        </Card>
      </section>

      <section>
        <h2 className="mb-4 font-display text-xl font-semibold">Pagamentos recentes</h2>
        <InvoiceTable invoices={recent} showCondo />
      </section>

    </div>
  );
}
