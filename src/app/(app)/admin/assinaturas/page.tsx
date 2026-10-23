import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Handshake, Plus, Settings2 } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { stripeConfigured, stripeWebhookSecret } from "@/lib/stripe";
import { ENTITLED, PAYING, brl, monthlyEquivalent } from "@/lib/billing-shared";
import { fmtDate, nowMs } from "@/lib/format";
import { MonthBars, RankBars } from "@/components/charts";
import { InvoiceBadge, SubscriptionBadge } from "@/components/billing/shared";
import { Alert, Card, CardHeader, LinkButton, PageHeader, Stat, cx } from "@/components/ui";
import { stickyHead } from "@/components/frozen";
import { SyncAllButton } from "./sync-all";
import { PartnersTab } from "./partners-tab";
import { CommissionsTab } from "./commissions-tab";

export const metadata: Metadata = { title: "Assinaturas" };

const TABS = { geral: "Visão geral", parceiros: "Parceiros", comissoes: "Comissões" } as const;
type Tab = keyof typeof TABS;

export default async function BillingAdminPage({ searchParams }: PageProps<"/admin/assinaturas">) {
  await requireUser("superadmin");
  const sp = await searchParams;
  const tab: Tab = typeof sp.aba === "string" && sp.aba in TABS ? (sp.aba as Tab) : "geral";
  const [configured, webhook, dueTotal] = await Promise.all([
    stripeConfigured(),
    stripeWebhookSecret(),
    db.commission.aggregate({ where: { status: "due" }, _sum: { amountCents: true } }),
  ]);

  return (
    <div className="animate-in">
      <PageHeader
        eyebrow="Superadministração"
        title="Assinaturas e receita"
        description="Recorrência via Stripe de todos os condomínios, parceiros comerciais e comissões."
        actions={
          tab === "parceiros" ? (
            <LinkButton href="/admin/assinaturas/parceiros/novo"><Plus className="size-4" />Novo parceiro</LinkButton>
          ) : (
            <>
              <LinkButton href="/admin/assinaturas/planos" variant="outline"><Settings2 className="size-4" />Planos</LinkButton>
              <SyncAllButton />
            </>
          )
        }
      />
      {!configured && <div className="mb-6"><Alert tone="warn">Stripe não configurado. Informe as chaves em Configurações → Stripe. Os dados abaixo refletem o último estado sincronizado.</Alert></div>}
      {configured && !webhook && (
        <div className="mb-6"><Alert tone="warn">Segredo do webhook não definido (Configurações → Stripe): renovações, falhas de pagamento e comissões só aparecem ao sincronizar manualmente.</Alert></div>
      )}

      <div className="mb-6 flex gap-1 overflow-x-auto rounded-xl bg-bg-2 p-1 text-sm sm:inline-flex">
        {(Object.keys(TABS) as Tab[]).map((t) => (
          <Link key={t} href={t === "geral" ? "/admin/assinaturas" : `/admin/assinaturas?aba=${t}`} className={cx("shrink-0 rounded-lg px-4 py-1.5 transition", tab === t ? "bg-surface font-medium text-brand shadow-card" : "text-muted hover:text-fg")}>
            {TABS[t]}
            {t === "comissoes" && (dueTotal._sum.amountCents ?? 0) > 0 && <span className="ml-1.5 rounded-full bg-warn/15 px-1.5 text-[11px] font-semibold text-warn">{brl(dueTotal._sum.amountCents ?? 0)}</span>}
          </Link>
        ))}
      </div>

      {tab === "geral" && <Overview filter={typeof sp.status === "string" ? sp.status : ""} dueCents={dueTotal._sum.amountCents ?? 0} />}
      {tab === "parceiros" && <PartnersTab q={typeof sp.q === "string" ? sp.q : ""} />}
      {tab === "comissoes" && <CommissionsTab status={typeof sp.status === "string" ? sp.status : ""} />}
    </div>
  );
}

/** Visão geral: números, condomínios e receita à esquerda; planos, pagamentos e comissões na coluna da direita. */
async function Overview({ filter, dueCents }: { filter: string; dueCents: number }) {
  const since12 = new Date(new Date().getFullYear(), new Date().getMonth() - 11, 1);
  const [condos, paid12, recent] = await Promise.all([
    db.condominium.findMany({
      where: { deletedAt: null },
      include: {
        subscription: { include: { plan: true } },
        billingDeal: { select: { active: true } },
        partner: { select: { id: true, name: true, kind: true } },
        payments: { where: { status: { in: ["paid", "open", "uncollectible"] } }, orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { name: "asc" },
    }),
    db.payment.findMany({ where: { status: "paid", paidAt: { gte: since12 } }, select: { amountPaid: true, paidAt: true } }),
    db.payment.findMany({ where: { status: { not: "draft" } }, include: { condominium: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 8 }),
  ]);

  const subs = condos.map((c) => c.subscription).filter((s): s is NonNullable<typeof s> => !!s);
  const statusOf = (c: (typeof condos)[number]) => (c.subscription?.stripeSubscriptionId ? c.subscription.status : "none");
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
      const n = s.plan?.name ?? (s.stripeSubscriptionId ? "Negociação especial" : "Sem plano");
      acc[n] = { name: n, value: (acc[n]?.value ?? 0) + 1 };
      return acc;
    }, {}),
  );
  const groups: Record<string, string[]> = { pagantes: ["active"], teste: ["trialing"], inadimplentes: ["past_due", "unpaid"], cancelados: ["canceled", "incomplete_expired"], sem: ["none", "incomplete"] };
  const list = filter && groups[filter] ? condos.filter((c) => groups[filter].includes(statusOf(c))) : condos;

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="MRR" value={brl(mrr)} tone="brand" hint={trialMrr ? `+ ${brl(trialMrr)} em teste` : undefined} />
        <Stat label="ARR" value={brl(mrr * 12)} />
        <Stat label="Recebido (30 dias)" value={brl(last30)} tone="ok" />
        <Stat label="Ticket médio" value={brl(count(PAYING) ? Math.round(mrr / count(PAYING)) : 0)} />
      </div>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {([
          ["pagantes", "Pagantes", count(["active"]), "text-ok"],
          ["teste", "Em teste", count(["trialing"]), "text-info"],
          ["inadimplentes", "Inadimplentes", count(["past_due", "unpaid"]), "text-bad"],
          ["cancelados", "Cancelados", count(["canceled", "incomplete_expired"]), "text-muted"],
          ["sem", "Sem assinatura", count(["none", "incomplete"]), "text-muted"],
        ] as const).map(([k, label, n, color]) => (
          <Link key={k} href={filter === k ? "/admin/assinaturas" : `/admin/assinaturas?status=${k}`} className={cx("rounded-2xl border bg-surface px-4 py-3 shadow-card transition hover:border-line-strong", filter === k ? "border-brand/40" : "border-line")}>
            <p className="text-xs font-medium text-muted">{label}</p>
            <p className={cx("mt-1 font-num text-xl font-bold", color)}>{n}</p>
          </Link>
        ))}
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <Card className="overflow-hidden">
            <CardHeader title={<span>Condomínios {filter && <span className="text-sm font-medium text-muted">· filtro ativo</span>}</span>} subtitle={`${list.length} de ${condos.length}`} />
            <div className="max-h-[32rem] overflow-auto overscroll-contain">
              <table className="w-full min-w-[820px] text-sm">
                <thead className={`${stickyHead} text-left text-xs font-medium text-muted`}>
                  <tr>
                    <th className="px-5 py-3 font-medium">Condomínio</th>
                    <th className="px-5 py-3 font-medium">Plano</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 text-right font-medium">MRR</th>
                    <th className="px-5 py-3 font-medium">Próxima cobrança</th>
                    <th className="px-5 py-3 font-medium">Parceiro</th>
                    <th />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {list.map((c) => {
                    const s = c.subscription;
                    const st = statusOf(c);
                    return (
                      <tr key={c.id} className="group">
                        <td className="px-5 py-3">
                          <Link href={`/admin/assinaturas/${c.id}`} className="font-medium hover:text-brand">{c.name}</Link>
                          {/* Atalho para definir o preço por unidade deste condomínio */}
                          <Link href={`/admin/assinaturas/${c.id}#negociacao`} className={cx("ml-2 rounded-full px-2 py-0.5 text-[11px] font-medium", c.billingDeal?.active ? "bg-brand-soft text-brand" : "text-muted ring-1 ring-line hover:text-brand [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100")}>
                            {c.billingDeal?.active ? "Negociação" : "Negociar"}
                          </Link>
                          {!c.active && <p className="text-xs text-muted">Condomínio inativo</p>}
                        </td>
                        <td className="px-5 py-3">{s?.plan ? `${s.plan.name} · ${s.interval === "year" ? "anual" : "mensal"}` : s?.stripeSubscriptionId ? `Negociação · ${s.quantity} unid. · ${s.interval === "year" ? "anual" : "mensal"}` : "—"}</td>
                        <td className="px-5 py-3">
                          <SubscriptionBadge status={st} />
                          {s?.cancelAtPeriodEnd && st !== "canceled" && <p className="mt-1 text-[11px] text-warn">Cancela em {fmtDate(s.currentPeriodEnd)}</p>}
                        </td>
                        <td className="px-5 py-3 text-right font-num tabular-nums">{s && PAYING.includes(s.status) ? brl(monthlyEquivalent(s.unitAmount ?? 0, s.interval)) : "—"}</td>
                        <td className="px-5 py-3 text-xs">{s && ENTITLED.includes(s.status) && !s.cancelAtPeriodEnd ? fmtDate(s.status === "trialing" ? s.trialEnd : s.currentPeriodEnd) : "—"}</td>
                        <td className="px-5 py-3 text-xs">
                          {c.partner ? <Link href={`/admin/assinaturas/parceiros/${c.partner.id}`} className="inline-flex items-center gap-1 text-fg-2 hover:text-brand"><Handshake className="size-3.5 text-brand" />{c.partner.name}</Link> : <span className="text-muted">—</span>}
                        </td>
                        <td className="pr-4"><Link href={`/admin/assinaturas/${c.id}`} aria-label="Detalhes"><ChevronRight className="size-4 text-muted group-hover:text-brand" /></Link></td>
                      </tr>
                    );
                  })}
                  {!list.length && <tr><td colSpan={7} className="px-5 py-10 text-center text-muted">Nenhum condomínio neste filtro.</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
          <Card>
            <CardHeader title="Receita recebida" subtitle="Faturas pagas nos últimos 12 meses" />
            <div className="p-4"><MonthBars data={months} /></div>
          </Card>
        </div>

        <div className="space-y-6">
          <Link href="/admin/assinaturas?aba=comissoes" className="block">
            <Card className="p-5 transition hover:border-line-strong">
              <p className="flex items-center gap-2 text-xs font-medium text-muted"><Handshake className="size-4 text-brand" />Comissões a pagar</p>
              <p className={cx("mt-2 font-num text-2xl font-bold", dueCents ? "text-warn" : "text-fg")}>{brl(dueCents)}</p>
              <p className="mt-1 text-xs text-muted">Parceiros, regras e pagamentos na aba Comissões.</p>
            </Card>
          </Link>
          <Card>
            <CardHeader title="Condomínios por plano" subtitle="Assinaturas ativas e em teste" />
            <div className="p-4"><RankBars data={byPlan} /></div>
          </Card>
          <Card>
            <CardHeader title="Pagamentos recentes" />
            {recent.length ? (
              <ul className="divide-y divide-line">
                {recent.map((i) => (
                  <li key={i.id} className="flex items-center gap-3 px-5 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{i.condominium?.name}</span>
                      <span className="block text-xs text-muted">{fmtDate(i.paidAt ?? i.createdAt)}</span>
                    </span>
                    <span className="text-right">
                      <span className="block font-num text-sm font-semibold tabular-nums">{brl(i.status === "paid" ? i.amountPaid : i.amountDue)}</span>
                      <InvoiceBadge status={i.status} />
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-6 text-sm text-muted">As faturas aparecem aqui após a primeira cobrança.</p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

