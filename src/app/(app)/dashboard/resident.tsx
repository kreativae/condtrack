import Link from "next/link";
import { createElement } from "react";
import { CalendarDays, Contact, Inbox } from "lucide-react";
import { fmtPeriod } from "@/lib/booking";
import { db } from "@/lib/db";
import { nowMs } from "@/lib/format";
import type { CurrentUser } from "@/lib/auth";
import { fmtHours } from "@/lib/metrics";
import { feedInclude } from "@/components/feed-card";
import { ServiceShowcase } from "@/components/service-card";
import { Card, PageHeader, Stat } from "@/components/ui";
import { categoryIcon } from "@/lib/category-icons";
import { unitLabel } from "@/lib/units";

/** Morador: somente visualização dos serviços entregues. */
export async function ResidentDashboard({ user }: { user: CurrentUser }) {
  const cid = user.condominiumId!;
  const delivered = { condominiumId: cid, status: "approved" };
  const since30 = new Date(nowMs() - 30 * 86400_000);
  const startOfYear = new Date(new Date().getFullYear(), 0, 1);

  const [recent, month, year, times, ratings, byCat, cats] = await Promise.all([
    db.serviceOrder.findMany({ where: delivered, include: feedInclude, orderBy: { approvedAt: "desc" }, take: 4 }),
    db.serviceOrder.count({ where: { ...delivered, approvedAt: { gte: since30 } } }),
    db.serviceOrder.count({ where: { ...delivered, approvedAt: { gte: startOfYear } } }),
    db.serviceOrder.findMany({ where: delivered, select: { createdAt: true, approvedAt: true }, take: 200, orderBy: { approvedAt: "desc" } }),
    db.serviceOrder.aggregate({ where: { ...delivered, rating: { not: null } }, _avg: { rating: true } }),
    db.serviceOrder.groupBy({ by: ["categoryId"], where: { ...delivered, approvedAt: { gte: startOfYear } }, _count: true }),
    db.serviceCategory.findMany({ where: { condominiumId: cid }, select: { id: true, name: true, icon: true, color: true } }),
  ]);

  const avgHours = times.length ? times.reduce((a, t) => a + (t.approvedAt!.getTime() - t.createdAt.getTime()), 0) / times.length / 3600_000 : null;
  const catData = byCat
    .map((r) => {
      const c = cats.find((x) => x.id === r.categoryId);
      return { id: c?.id ?? "sem", name: c?.name ?? "Outros", icon: c?.icon ?? "wrench", color: c?.color ?? null, value: r._count };
    })
    .sort((a, b) => b.value - a.value);
  const unit = user.units[0]?.unit;
  const unitIds = user.units.filter((u) => u.unit.building.condominiumId === cid).map((u) => u.unitId);
  const [parcels, openTickets] = await Promise.all([
    db.parcel.count({ where: { unitId: { in: unitIds }, status: "waiting" } }),
    db.ticket.count({ where: { condominiumId: cid, createdById: user.id, status: { in: ["open", "in_review", "converted"] } } }),
  ]);
  const next = await db.booking.findFirst({
    where: { condominiumId: cid, status: { in: ["pending", "approved"] }, endAt: { gt: new Date() }, OR: [{ requestedById: user.id }, { unitId: { in: unitIds } }] },
    include: { commonArea: { select: { name: true } } },
    orderBy: { startAt: "asc" },
  });

  return (
    <div className="animate-in">
      <PageHeader
        eyebrow={unit ? unitLabel(unit) : user.condominium?.name}
        title={`Olá, ${user.name.split(" ")[0]}`}
        description="Acompanhe tudo o que foi feito no seu condomínio."
      />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Link href="/reservas" className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 transition hover:border-brand/40">
          <span className="flex size-10 items-center justify-center rounded-xl bg-ok/12 text-ok"><CalendarDays className="size-5" /></span>
          <span className="min-w-0 flex-1"><b className="block text-sm">Reservas</b><span className="text-xs text-muted">{next ? `Próxima: ${next.commonArea.name}, ${fmtPeriod(next.startAt, next.endAt)}` : "Salão, churrasqueira e outros espaços"}</span></span>
        </Link>
        <Link href="/minha-unidade" className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 transition hover:border-brand/40">
          <span className="flex size-10 items-center justify-center rounded-xl bg-brand-soft text-brand"><Contact className="size-5" /></span>
          <span className="min-w-0 flex-1"><b className="block text-sm">Minha unidade</b><span className={parcels ? "text-xs font-medium text-brand" : "text-xs text-muted"}>{parcels ? `${parcels} encomenda(s) aguardando na portaria` : "Moradores, visitantes, prestadores e encomendas"}</span></span>
        </Link>
        <Link href={openTickets ? "/chamados" : "/chamados/novo"} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 transition hover:border-brand/40">
          <span className="flex size-10 items-center justify-center rounded-xl bg-warn/12 text-warn"><Inbox className="size-5" /></span>
          <span className="min-w-0 flex-1"><b className="block text-sm">Chamados</b><span className={openTickets ? "text-xs font-medium text-brand" : "text-xs text-muted"}>{openTickets ? `${openTickets} chamado(s) em andamento` : "Problema, reclamação ou sugestão para o síndico"}</span></span>
        </Link>
      </div>
      <div className="mb-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="Entregues em 30 dias" value={month} tone="brand" href="/feed?periodo=30d" />
        <Stat label={`Entregues em ${new Date().getFullYear()}`} value={year} href="/feed?periodo=ano" />
        <Stat label="Tempo médio de resolução" value={fmtHours(avgHours)} />
        <Stat label="Avaliação média" value={ratings._avg.rating ? `${ratings._avg.rating.toFixed(1)} ★` : "—"} />
      </div>

      {/* Por categoria (no ano): cada uma abre o feed já filtrado */}
      {catData.length > 0 && (
        <div className="mb-6">
          <p className="mb-2 text-xs font-medium text-muted">Serviços por categoria em {new Date().getFullYear()}</p>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 py-1 [scrollbar-width:none] sm:-mx-1 sm:flex-wrap sm:px-1">
            {catData.map((c) => (
              <Link key={c.id} href={c.id === "sem" ? "/feed" : `/feed?cat=${c.id}`} className="inline-flex shrink-0 items-center gap-2 rounded-2xl bg-surface py-1.5 pl-1.5 pr-3 text-sm text-fg-2 ring-1 ring-line transition hover:ring-line-strong">
                <span className="grid size-7 place-items-center rounded-xl bg-bg-2" style={c.color ? { color: c.color } : undefined}>{createElement(categoryIcon(c.icon), { className: "size-4" })}</span>
                {c.name}<span className="text-xs text-muted">{c.value}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold">Últimos serviços entregues</h2>
          <Link href="/feed" className="text-sm font-medium text-brand hover:underline">Ver todos</Link>
        </div>
        {recent.length ? <ServiceShowcase items={recent} /> : <Card className="p-10 text-center text-sm text-muted">Nenhum serviço entregue ainda.</Card>}
      </section>
    </div>
  );
}
