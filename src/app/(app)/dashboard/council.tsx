import Link from "next/link";
import { Megaphone, Plus } from "lucide-react";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth";
import { orderListInclude } from "@/lib/orders";
import { fmtRelative } from "@/lib/format";
import { FeedCard, feedInclude } from "@/components/feed-card";
import { OrderList } from "@/components/order-list";
import { Card, CardHeader, LinkButton, PageHeader } from "@/components/ui";

export async function CouncilDashboard({ user }: { user: CurrentUser }) {
  const cid = user.condominiumId!;
  const [feed, mine, news] = await Promise.all([
    db.serviceOrder.findMany({ where: { condominiumId: cid, status: "approved" }, include: feedInclude, orderBy: { approvedAt: "desc" }, take: 3 }),
    db.serviceOrder.findMany({ where: { requestedById: user.id, status: { notIn: ["cancelled"] } }, include: orderListInclude, orderBy: { createdAt: "desc" }, take: 5 }),
    db.announcement.findMany({ where: { condominiumId: cid }, orderBy: { publishedAt: "desc" }, take: 3 }),
  ]);
  const unit = user.units[0]?.unit;

  return (
    <div className="animate-in">
      <PageHeader
        eyebrow={unit ? `${unit.building.name} · Unidade ${unit.number}` : user.condominium?.name}
        title={`Olá, ${user.name.split(" ")[0]}`}
        actions={<LinkButton href="/os/nova"><Plus className="size-4" />Nova solicitação</LinkButton>}
      />
      <div className="grid gap-8 lg:grid-cols-[1.5fr_1fr]">
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-semibold text-xl">Serviços recentes no prédio</h2>
            <Link href="/feed" className="text-xs font-medium text-brand hover:underline">Ver feed</Link>
          </div>
          {feed.map((o) => <FeedCard key={o.id} o={o} />)}
        </section>
        <aside className="space-y-6">
          <div>
            <h2 className="mb-4 font-display font-semibold text-xl">Minhas solicitações</h2>
            <OrderList orders={mine} empty="Você ainda não abriu solicitações." />
          </div>
          <Card>
            <CardHeader title="Comunicados" action={<Link href="/comunicados" className="text-xs text-brand">Todos</Link>} />
            <ul className="divide-y divide-line">
              {news.map((n) => (
                <li key={n.id} className="flex gap-3 px-5 py-4">
                  <Megaphone className="mt-0.5 size-4 shrink-0 text-brand" />
                  <div>
                    <p className="text-sm font-medium">{n.title}</p>
                    <p className="line-clamp-2 text-xs text-muted">{n.content}</p>
                    <p className="mt-1 text-[11px] text-muted">{fmtRelative(n.publishedAt)}</p>
                  </div>
                </li>
              ))}
              {!news.length && <li className="px-5 py-6 text-sm text-muted">Sem comunicados.</li>}
            </ul>
          </Card>
        </aside>
      </div>
    </div>
  );
}
