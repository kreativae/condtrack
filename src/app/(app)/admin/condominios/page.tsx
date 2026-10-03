import type { Metadata } from "next";
import Link from "next/link";
import { Building2, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { orderMetrics, fmtHours } from "@/lib/metrics";
import { Badge, Card, LinkButton, PageHeader } from "@/components/ui";
import { SubscriptionBadge } from "@/components/billing/shared";
import { DemoCondoButton } from "@/components/admin/demo-condo-button";
import { RestoreCondoButton } from "@/components/admin/archive-condo";
import { fmtDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Condomínios" };
// A geração do condomínio de demonstração leva alguns segundos
export const maxDuration = 60;

export default async function CondosPage() {
  await requireUser("superadmin");
  const archived = await db.condominium.findMany({ where: { deletedAt: { not: null } }, select: { id: true, name: true, deletedAt: true, deletedBy: true }, orderBy: { deletedAt: "desc" } });
  const condos = await db.condominium.findMany({
    where: { deletedAt: null },
    include: { _count: { select: { users: true, buildings: true } }, memberships: { where: { role: "syndic" }, select: { user: { select: { name: true } } } }, subscription: { include: { plan: true } } },
    orderBy: { name: "asc" },
  });
  const metrics = await Promise.all(condos.map((c) => orderMetrics({ condominiumId: c.id })));

  return (
    <div className="animate-in">
      <PageHeader eyebrow="Multi-condomínio" title="Condomínios" actions={<><DemoCondoButton /><LinkButton href="/admin/condominios/novo"><Plus className="size-4" />Novo condomínio</LinkButton></>} />
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {condos.map((c, i) => {
          const m = metrics[i];
          return (
            <Link key={c.id} href={`/admin/condominios/${c.id}`} className="group">
              <Card className="h-full overflow-hidden transition group-hover:border-line-strong">
                <div className="h-1" style={{ background: c.accentColor }} />
                <div className="p-6">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <span className="flex size-11 items-center justify-center rounded-xl bg-elevated text-brand ring-1 ring-line-strong"><Building2 className="size-5" strokeWidth={1.5} /></span>
                    <span className="flex flex-wrap justify-end gap-1.5">
                      {c.demo && <Badge tone="info">Demonstração</Badge>}
                      <Badge tone={c.active ? "ok" : "muted"} dot>{c.active ? "Ativo" : "Inativo"}</Badge>
                    </span>
                  </div>
                  <h2 className="font-display font-semibold text-xl group-hover:text-brand">{c.name}</h2>
                  <p className="mt-1 line-clamp-1 text-xs text-muted">{c.address ?? "Endereço não informado"}</p>
                  <p className="mt-1 text-xs text-muted">Síndico: {c.memberships[0]?.user.name ?? "—"}</p>
                  <div className="mt-3 flex items-center gap-2 text-xs text-muted">
                    <SubscriptionBadge status={c.subscription?.stripeSubscriptionId ? c.subscription.status : "none"} />
                    {c.subscription?.plan && <span>{c.subscription.plan.name}</span>}
                  </div>
                  <dl className="mt-5 grid grid-cols-3 gap-2 border-t border-line pt-4 text-center">
                    <div><dt className="text-xs font-medium text-muted">Abertas</dt><dd className="font-num text-lg">{m.open}</dd></div>
                    <div><dt className="text-xs font-medium text-muted">Atrasadas</dt><dd className={m.overdue ? "font-num text-lg text-bad" : "font-num text-lg"}>{m.overdue}</dd></div>
                    <div><dt className="text-xs font-medium text-muted">Tempo méd.</dt><dd className="font-num text-lg">{fmtHours(m.avgHours)}</dd></div>
                  </dl>
                  <p className="mt-3 text-[11px] text-muted">{c._count.buildings} {c.layout === "horizontal" ? "quadra(s)" : c.layout === "mixed" ? "torre(s)/quadra(s)" : "torre(s)"} · {c._count.users} usuário(s)</p>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
      {archived.length > 0 && (
        <details className="mt-8 rounded-2xl border border-line bg-surface">
          <summary className="cursor-pointer px-5 py-4 text-sm font-medium">Excluídos ({archived.length})</summary>
          <ul className="divide-y divide-line border-t border-line">
            {archived.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <Link href={`/admin/condominios/${a.id}`} className="font-medium hover:text-brand">{a.name}</Link>
                  <p className="text-xs text-muted">Excluído em {fmtDateTime(a.deletedAt)}{a.deletedBy && ` por ${a.deletedBy}`} · dados guardados</p>
                </div>
                <RestoreCondoButton id={a.id} size="sm" />
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
