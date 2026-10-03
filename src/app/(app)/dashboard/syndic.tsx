import Link from "next/link";
import { Plus } from "lucide-react";
import { db } from "@/lib/db";
import { inCondo } from "@/lib/memberships";
import type { CurrentUser } from "@/lib/auth";
import { fmtHours, orderMetrics } from "@/lib/metrics";
import { orderListInclude } from "@/lib/orders";
import { RankBars } from "@/components/charts";
import { OrderList } from "@/components/order-list";
import { StatusBreakdown } from "@/components/status-breakdown";
import { Card, CardHeader, LinkButton, PageHeader, StatStrip, cx } from "@/components/ui";
import { AttentionStrip } from "@/components/dashboard/attention";
import { nowMs } from "@/lib/format";
import { ChecklistSummary } from "@/components/checklist/summary";
import { FinanceSummary } from "@/components/finance-summary";
import { DashboardSettings } from "@/components/dashboard-settings";
import { DASHBOARD_SECTIONS, dashboardVisibility } from "@/lib/dashboard";

export async function SyndicDashboard({ user }: { user: CurrentUser }) {
  const cid = user.condominiumId!;
  const show = dashboardVisibility(user.dashboardHidden);
  const where = { condominiumId: cid };
  const now = nowMs();
  const DAY = 86_400_000;
  const [m, pending, recent, byCat, byArea, byProvider, cats, areas, providers, approvedRecent, openedWeek] = await Promise.all([
    orderMetrics(where),
    db.serviceOrder.findMany({ where: { ...where, status: "validated" }, include: orderListInclude, orderBy: { validatedAt: "asc" } }),
    db.serviceOrder.findMany({ where, include: orderListInclude, orderBy: { updatedAt: "desc" }, take: 6 }),
    db.serviceOrder.groupBy({ by: ["categoryId"], where, _count: true }),
    db.serviceOrder.groupBy({ by: ["commonAreaId"], where: { ...where, commonAreaId: { not: null } }, _count: true }),
    db.serviceOrder.groupBy({ by: ["assignedToId"], where: { ...where, assignedToId: { not: null } }, _count: true }),
    db.serviceCategory.findMany({ where }),
    db.commonArea.findMany({ where }),
    db.user.findMany({ where: inCondo(cid, ["provider"]), select: { id: true, name: true } }),
    // Aprovadas nas últimas 8 semanas: mini gráfico e comparação com os 30 dias anteriores
    db.serviceOrder.findMany({ where: { ...where, approvedAt: { gte: new Date(now - 60 * DAY) } }, select: { approvedAt: true } }),
    db.serviceOrder.count({ where: { ...where, createdAt: { gte: new Date(now - 7 * DAY) } } }),
  ]);
  const weekly = Array.from({ length: 8 }, (_, i) => {
    const end = now - (7 - i) * 7 * DAY;
    return approvedRecent.filter((o) => o.approvedAt && o.approvedAt.getTime() > end - 7 * DAY && o.approvedAt.getTime() <= end).length;
  });
  const prev30 = approvedRecent.filter((o) => o.approvedAt && o.approvedAt.getTime() <= now - 30 * DAY).length;
  const diff30 = m.approved30 - prev30;
  const name = (list: { id: string; name: string }[], id: string | null) => list.find((x) => x.id === id)?.name ?? "Sem categoria";
  const top = <T,>(rows: (T & { _count: number })[], key: (r: T) => string) =>
    rows.map((r) => ({ name: key(r), value: r._count })).sort((a, b) => b.value - a.value).slice(0, 6);

  const charts = ["status", "category", "areas"].filter(show).length;

  return (
    <div className="animate-in">
      <PageHeader
        eyebrow={user.condominium?.name}
        title={`Olá, ${user.name.split(" ")[0]}`}
        description="Visão geral do condomínio e o que precisa de você."
        actions={<><DashboardSettings sections={DASHBOARD_SECTIONS.syndic} hidden={user.dashboardHidden.split(",").filter(Boolean)} /><LinkButton href="/os/nova"><Plus className="size-4" />Nova OS</LinkButton></>}
      />
      {show("attention") && <AttentionStrip condominiumId={cid} />}
      {show("stats") && (
        <StatStrip
          items={[
            { label: "OS em aberto", value: m.open, hint: openedWeek ? `${openedWeek} ${openedWeek === 1 ? "aberta" : "abertas"} nos últimos 7 dias` : "nenhuma nova nos últimos 7 dias" },
            {
              label: "Concluídas em 30 dias", value: m.approved30, spark: weekly,
              trend: diff30 === 0 ? undefined : { text: `${diff30 > 0 ? "↑" : "↓"} ${Math.abs(diff30)} em relação aos 30 dias anteriores`, good: diff30 > 0 },
              hint: "igual aos 30 dias anteriores",
            },
            { label: "Atrasadas", value: m.overdue, tone: m.overdue ? "bad" : undefined, hint: m.overdue ? "passaram do prazo" : "nenhuma fora do prazo" },
            { label: "Tempo médio de resolução", value: fmtHours(m.avgHours), hint: "da abertura à aprovação" },
          ]}
        />
      )}

      {show("checklist") && <ChecklistSummary condominiumId={cid} />}
      {show("finance") && <FinanceSummary condominiumId={cid} />}

      {show("pending") && pending.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-4 flex items-center gap-3 font-display font-semibold text-xl">Aprovações pendentes <span className="font-num text-sm text-brand">{pending.length}</span></h2>
          <OrderList orders={pending} />
        </section>
      )}

      {charts > 0 && (
      <div className={cx("mb-6 grid gap-6", charts === 3 ? "lg:grid-cols-3" : charts === 2 && "lg:grid-cols-2")}>
        {show("status") && (
        <Card>
          <CardHeader title="OS por status" />
          <StatusBreakdown counts={m.counts} />
        </Card>
        )}
        {show("category") && (
        <Card>
          <CardHeader title="OS por categoria" />
          <div className="p-4"><RankBars data={top(byCat, (r) => name(cats, r.categoryId))} /></div>
        </Card>
        )}
        {show("areas") && (
        <Card>
          <CardHeader title="Áreas com mais manutenção" />
          <div className="p-4"><RankBars data={top(byArea, (r) => name(areas, r.commonAreaId))} /></div>
        </Card>
        )}
      </div>
      )}

      <div className={cx("grid gap-6", show("providers") && show("activity") && "lg:grid-cols-[1fr_1.4fr]")}>
        {show("providers") && (
        <Card>
          <CardHeader title="Prestadores mais acionados" />
          <div className="p-4"><RankBars data={top(byProvider, (r) => name(providers, r.assignedToId))} /></div>
        </Card>
        )}
        {show("activity") && (
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display font-semibold text-xl">Atividade recente</h2>
            <Link href="/os" className="text-xs font-medium text-brand hover:underline">Ver todas</Link>
          </div>
          <OrderList orders={recent} />
        </section>
        )}
      </div>
    </div>
  );
}
