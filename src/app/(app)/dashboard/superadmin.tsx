import Link from "next/link";
import { Plus } from "lucide-react";
import { db } from "@/lib/db";
import { orderMetrics, fmtHours } from "@/lib/metrics";
import { orderListInclude } from "@/lib/orders";
import { ACTIVE_STATUSES } from "@/lib/workflow";
import { PairBars } from "@/components/charts";
import { PAYING, brl, monthlyEquivalent } from "@/lib/billing-shared";
import { OrderList } from "@/components/order-list";
import { Card, CardHeader, LinkButton, PageHeader, Stat } from "@/components/ui";

export async function SuperadminDashboard() {
  const [condos, m, users, late, subs] = await Promise.all([
    db.condominium.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    orderMetrics({}),
    db.user.count({ where: { status: "active" } }),
    db.serviceOrder.findMany({ where: { status: { in: ACTIVE_STATUSES }, dueDate: { lt: new Date() } }, include: orderListInclude, orderBy: { dueDate: "asc" }, take: 6 }),
    db.subscription.findMany({ where: { status: { in: PAYING }, cancelAtPeriodEnd: false } }),
  ]);
  const mrr = subs.reduce((a, s) => a + monthlyEquivalent(s.unitAmount ?? 0, s.interval), 0);

  const per = await Promise.all(
    condos.map(async (c) => {
      const x = await orderMetrics({ condominiumId: c.id });
      return { ...c, ...x };
    }),
  );
  const ranking = per.filter((p) => p.avgHours != null).sort((a, b) => a.avgHours! - b.avgHours!);

  return (
    <div className="animate-in">
      <PageHeader
        eyebrow="Superadministração"
        title="Visão global da plataforma"
        actions={<LinkButton href="/admin/condominios/novo"><Plus className="size-4" />Novo condomínio</LinkButton>}
      />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <Stat label="MRR" value={brl(mrr)} tone="brand" hint={`${subs.length} pagante(s)`} />
        <Stat label="Condomínios ativos" value={condos.length} />
        <Stat label="Usuários ativos" value={users} />
        <Stat label="OS em aberto" value={m.open} />
        <Stat label="Concluídas (30d)" value={m.approved30} tone="ok" />
        <Stat label="Atrasadas" value={m.overdue} tone={m.overdue ? "bad" : undefined} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title="OS por condomínio" subtitle="Em aberto × aprovadas (total)" />
          <div className="p-4">
            <PairBars data={per.map((p) => ({ name: p.name, a: p.open, b: p.counts.approved }))} a="Em aberto" b="Aprovadas" />
          </div>
        </Card>
        <Card>
          <CardHeader title="Ranking de eficiência" subtitle="Tempo médio da abertura à aprovação" />
          <ol className="divide-y divide-line">
            {ranking.length ? ranking.map((p, i) => (
              <li key={p.id} className="flex items-center gap-4 px-5 py-3.5">
                <span className="font-display font-semibold text-2xl text-brand">{i + 1}</span>
                <Link href={`/admin/condominios/${p.id}`} className="flex-1 truncate hover:text-brand">{p.name}</Link>
                <span className="font-num text-sm tabular-nums">{fmtHours(p.avgHours)}</span>
              </li>
            )) : <li className="px-5 py-8 text-center text-sm text-muted">Sem OS concluídas ainda.</li>}
          </ol>
        </Card>
      </div>

      <section className="mt-8">
        <h2 className="mb-4 font-display font-semibold text-xl">Alertas de OS atrasadas</h2>
        <OrderList orders={late} showCondo empty="Nenhuma OS atrasada. 👌" />
      </section>
    </div>
  );
}
