import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth";
import { orderListInclude } from "@/lib/orders";
import { OrderList } from "@/components/order-list";
import { PageHeader, Stat } from "@/components/ui";

export async function ProviderDashboard({ user }: { user: CurrentUser }) {
  const orders = await db.serviceOrder.findMany({
    where: { assignedToId: user.id, status: { in: ["assigned", "in_progress", "rejected", "completed", "validated"] } },
    include: orderListInclude,
    orderBy: [{ dueDate: "asc" }],
  });
  const done = await db.serviceOrder.count({ where: { assignedToId: user.id, status: "approved" } });
  const group = (s: string[]) => orders.filter((o) => s.includes(o.status));

  const sections: [string, string, string[]][] = [
    ["Devolvidas para ajuste", "Revise o comentário e refaça o que for necessário.", ["rejected"]],
    ["Em andamento", "Registre o DEPOIS e conclua.", ["in_progress"]],
    ["A iniciar", "Registre o ANTES e inicie o serviço.", ["assigned"]],
    ["Em validação", "Aguardando zelador e síndico.", ["completed", "validated"]],
  ];

  return (
    <div className="animate-in">
      <PageHeader eyebrow={user.company ?? "Prestador de serviço"} title="Minhas ordens de serviço" />
      <div className="mb-8 grid grid-cols-3 gap-4">
        <Stat label="A fazer" value={group(["assigned", "in_progress", "rejected"]).length} tone="brand" />
        <Stat label="Em validação" value={group(["completed", "validated"]).length} />
        <Stat label="Aprovadas" value={done} tone="ok" />
      </div>
      <div className="space-y-8">
        {sections.map(([title, hint, st]) => {
          const list = group(st);
          if (!list.length) return null;
          return (
            <section key={title}>
              <h2 className="font-display font-semibold text-xl">{title}</h2>
              <p className="mb-4 text-xs text-muted">{hint}</p>
              <OrderList orders={list} />
            </section>
          );
        })}
        {!orders.length && <OrderList orders={[]} empty="Nenhuma OS atribuída a você no momento." />}
      </div>
    </div>
  );
}
