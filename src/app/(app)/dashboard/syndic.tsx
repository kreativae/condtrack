import Link from "next/link";
import { Plus } from "lucide-react";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth";
import { fmtHours, orderMetrics } from "@/lib/metrics";
import { orderListInclude } from "@/lib/orders";
import { RankBars } from "@/components/charts";
import { OrderList } from "@/components/order-list";
import { StatusBreakdown } from "@/components/status-breakdown";
import { Card, CardHeader, LinkButton, PageHeader, Stat } from "@/components/ui";
import { ChecklistSummary } from "@/components/checklist/summary";

export async function SyndicDashboard({ user }: { user: CurrentUser }) {
  const cid = user.condominiumId!;
  const where = { condominiumId: cid };
  const [m, pending, recent, byCat, byArea, byProvider, cats, areas, providers] = await Promise.all([
    orderMetrics(where),
    db.serviceOrder.findMany({ where: { ...where, status: "validated" }, include: orderListInclude, orderBy: { validatedAt: "asc" } }),
    db.serviceOrder.findMany({ where, include: orderListInclude, orderBy: { updatedAt: "desc" }, take: 6 }),
    db.serviceOrder.groupBy({ by: ["categoryId"], where, _count: true }),
    db.serviceOrder.groupBy({ by: ["commonAreaId"], where: { ...where, commonAreaId: { not: null } }, _count: true }),
    db.serviceOrder.groupBy({ by: ["assignedToId"], where: { ...where, assignedToId: { not: null } }, _count: true }),
    db.serviceCategory.findMany({ where }),
    db.commonArea.findMany({ where }),
    db.user.findMany({ where: { condominiumId: cid, role: "provider" }, select: { id: true, name: true } }),
  ]);
  const name = (list: { id: string; name: string }[], id: string | null) => list.find((x) => x.id === id)?.name ?? "Sem categoria";
  const top = <T,>(rows: (T & { _count: number })[], key: (r: T) => string) =>
    rows.map((r) => ({ name: key(r), value: r._count })).sort((a, b) => b.value - a.value).slice(0, 6);

  return (
    <div className="animate-in">
      <PageHeader
        eyebrow={user.condominium?.name}
        title={`Olá, ${user.name.split(" ")[0]}`}
        description="Visão geral do condomínio e decisões pendentes."
        actions={<LinkButton href="/os/nova"><Plus className="size-4" />Nova OS</LinkButton>}
      />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="OS em aberto" value={m.open} />
        <Stat label="Aguardando sua aprovação" value={m.counts.validated} tone={m.counts.validated ? "brand" : undefined} />
        <Stat label="Atrasadas" value={m.overdue} tone={m.overdue ? "bad" : undefined} />
        <Stat label="Tempo médio de resolução" value={fmtHours(m.avgHours)} hint={`${m.approved30} concluídas em 30 dias`} />
      </div>

      <ChecklistSummary condominiumId={cid} />

      {pending.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-4 flex items-center gap-3 font-display font-semibold text-xl">Aprovações pendentes <span className="font-num text-sm text-brand">{pending.length}</span></h2>
          <OrderList orders={pending} />
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="OS por status" />
          <StatusBreakdown counts={m.counts} />
        </Card>
        <Card>
          <CardHeader title="OS por categoria" />
          <div className="p-4"><RankBars data={top(byCat, (r) => name(cats, r.categoryId))} /></div>
        </Card>
        <Card>
          <CardHeader title="Áreas com mais manutenção" />
          <div className="p-4"><RankBars data={top(byArea, (r) => name(areas, r.commonAreaId))} /></div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <Card>
          <CardHeader title="Prestadores mais acionados" />
          <div className="p-4"><RankBars data={top(byProvider, (r) => name(providers, r.assignedToId))} /></div>
        </Card>
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display font-semibold text-xl">Atividade recente</h2>
            <Link href="/os" className="text-xs font-medium text-brand hover:underline">Ver todas</Link>
          </div>
          <OrderList orders={recent} />
        </section>
      </div>
    </div>
  );
}
