import Link from "next/link";
import { db } from "@/lib/db";
import { nowMs } from "@/lib/format";
import type { CurrentUser } from "@/lib/auth";
import { fmtHours } from "@/lib/metrics";
import { RankBars } from "@/components/charts";
import { FeedCard, feedInclude } from "@/components/feed-card";
import { Card, CardHeader, PageHeader, Stat } from "@/components/ui";
import { unitLabel } from "@/lib/units";

/** Morador: somente visualização dos serviços entregues. */
export async function ResidentDashboard({ user }: { user: CurrentUser }) {
  const cid = user.condominiumId!;
  const delivered = { condominiumId: cid, status: "approved" };
  const since30 = new Date(nowMs() - 30 * 86400_000);
  const startOfYear = new Date(new Date().getFullYear(), 0, 1);

  const [recent, month, year, times, ratings, byCat, cats] = await Promise.all([
    db.serviceOrder.findMany({ where: delivered, include: feedInclude, orderBy: { approvedAt: "desc" }, take: 3 }),
    db.serviceOrder.count({ where: { ...delivered, approvedAt: { gte: since30 } } }),
    db.serviceOrder.count({ where: { ...delivered, approvedAt: { gte: startOfYear } } }),
    db.serviceOrder.findMany({ where: delivered, select: { createdAt: true, approvedAt: true }, take: 200, orderBy: { approvedAt: "desc" } }),
    db.serviceOrder.aggregate({ where: { ...delivered, rating: { not: null } }, _avg: { rating: true } }),
    db.serviceOrder.groupBy({ by: ["categoryId"], where: { ...delivered, approvedAt: { gte: startOfYear } }, _count: true }),
    db.serviceCategory.findMany({ where: { condominiumId: cid }, select: { id: true, name: true } }),
  ]);

  const avgHours = times.length ? times.reduce((a, t) => a + (t.approvedAt!.getTime() - t.createdAt.getTime()), 0) / times.length / 3600_000 : null;
  const catData = byCat
    .map((r) => ({ name: cats.find((c) => c.id === r.categoryId)?.name ?? "Outros", value: r._count }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);
  const unit = user.units[0]?.unit;

  return (
    <div className="animate-in">
      <PageHeader
        eyebrow={unit ? unitLabel(unit) : user.condominium?.name}
        title={`Olá, ${user.name.split(" ")[0]}`}
        description="Acompanhe tudo o que foi feito no seu condomínio."
      />
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Entregues em 30 dias" value={month} tone="brand" />
        <Stat label={`Entregues em ${new Date().getFullYear()}`} value={year} />
        <Stat label="Tempo médio de resolução" value={fmtHours(avgHours)} />
        <Stat label="Avaliação média" value={ratings._avg.rating ? `${ratings._avg.rating.toFixed(1)} ★` : "—"} />
      </div>

      <div className="grid gap-8 lg:grid-cols-[1.5fr_1fr]">
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold">Últimos serviços entregues</h2>
            <Link href="/feed" className="text-sm font-medium text-brand hover:underline">Ver todos</Link>
          </div>
          {recent.map((o) => <FeedCard key={o.id} o={o} />)}
          {!recent.length && <Card className="p-10 text-center text-sm text-muted">Nenhum serviço entregue ainda.</Card>}
        </section>
        <aside>
          <Card className="lg:sticky lg:top-24">
            <CardHeader title="Serviços por categoria" subtitle={`Entregues em ${new Date().getFullYear()}`} />
            <div className="p-4"><RankBars data={catData} /></div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
