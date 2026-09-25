import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { UserPlus } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { orderMetrics, fmtHours } from "@/lib/metrics";
import { ROLE_LABEL, type Role } from "@/lib/roles";
import { saveCondominium, toggleCondominium } from "@/app/actions/admin";
import { CondoForm } from "@/components/admin/condo-form";
import { Card, CardHeader, LinkButton, PageHeader, Stat, buttonClass } from "@/components/ui";
import { LAYOUTS, type Layout } from "@/lib/units";

export const metadata: Metadata = { title: "Condomínio" };

export default async function CondoPage({ params }: PageProps<"/admin/condominios/[id]">) {
  await requireUser("superadmin");
  const { id } = await params;
  const c = await db.condominium.findUnique({
    where: { id },
    include: { buildings: { include: { _count: { select: { units: true } } } }, categories: true, commonAreas: true },
  });
  if (!c) notFound();
  const [m, staff] = await Promise.all([
    orderMetrics({ condominiumId: id }),
    db.user.groupBy({ by: ["role"], where: { condominiumId: id, status: "active" }, _count: true }),
  ]);

  return (
    <div className="animate-in">
      <PageHeader
        eyebrow="Condomínio"
        title={c.name}
        description={c.address}
        actions={
          <>
            <LinkButton variant="outline" href={`/admin/usuarios/novo?role=syndic`}><UserPlus className="size-4" />Atribuir síndico</LinkButton>
            <form action={toggleCondominium.bind(null, c.id)}>
              <button className={buttonClass(c.active ? "danger" : "success")}>{c.active ? "Desativar" : "Reativar"}</button>
            </form>
          </>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="OS em aberto" value={m.open} />
        <Stat label="Concluídas (30d)" value={m.approved30} tone="ok" />
        <Stat label="Atrasadas" value={m.overdue} tone={m.overdue ? "bad" : undefined} />
        <Stat label="Tempo médio" value={fmtHours(m.avgHours)} />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Card><CardHeader title="Dados e identidade visual" /><div className="p-6"><CondoForm action={saveCondominium.bind(null, c.id)} initial={c} /></div></Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Pessoas" action={<Link href={`/admin/usuarios`} className="text-xs text-brand">Gerenciar</Link>} />
            <ul className="divide-y divide-line text-sm">
              {staff.map((s) => <li key={s.role} className="flex justify-between px-5 py-3"><span>{ROLE_LABEL[s.role as Role]}</span><span className="font-num">{s._count}</span></li>)}
            </ul>
          </Card>
          <Card>
            <CardHeader title="Estrutura" subtitle={LAYOUTS[c.layout as Layout]?.label ?? undefined} action={<Link href={`/admin/condominios/${c.id}/estrutura`} className="text-xs font-medium text-brand hover:underline">Gerenciar</Link>} />
            <ul className="divide-y divide-line text-sm">
              {c.buildings.map((b) => <li key={b.id} className="flex justify-between px-5 py-3"><span>{b.name}</span><span className="text-muted">{b._count.units} {b.kind === "block" ? (c.houseNoun === "lot" ? "lotes" : "casas") : "unidades"}</span></li>)}
            </ul>
            <div className="border-t border-line px-5 py-4 text-xs text-muted">
              <p><b className="text-fg-2">Categorias:</b> {c.categories.map((x) => x.name).join(", ")}</p>
              <p className="mt-2"><b className="text-fg-2">Áreas comuns:</b> {c.commonAreas.map((x) => x.name).join(", ")}</p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
