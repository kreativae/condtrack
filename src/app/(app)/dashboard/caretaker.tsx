import { Plus } from "lucide-react";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth";
import { orderListInclude } from "@/lib/orders";
import { ACTIVE_STATUSES } from "@/lib/workflow";
import { OrderList } from "@/components/order-list";
import { LinkButton, PageHeader, Stat } from "@/components/ui";
import Link from "next/link";
import { ChecklistToday } from "@/components/checklist/today";
import { dayItemsForUi } from "@/lib/checklist-server";
import { spNow } from "@/lib/checklist";
import { nowMs } from "@/lib/format";

export async function CaretakerDashboard({ user }: { user: CurrentUser }) {
  const where = { condominiumId: user.condominiumId! };
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const [toValidate, urgent, inProgress, today, checklist] = await Promise.all([
    db.serviceOrder.findMany({ where: { ...where, status: "completed" }, include: orderListInclude, orderBy: { completedAt: "asc" } }),
    db.serviceOrder.findMany({ where: { ...where, status: { in: ACTIVE_STATUSES }, OR: [{ priority: "urgent" }, { dueDate: { lt: new Date() } }] }, include: orderListInclude, orderBy: { dueDate: "asc" } }),
    db.serviceOrder.count({ where: { ...where, status: "in_progress" } }),
    db.serviceOrder.count({ where: { ...where, createdAt: { gte: startOfDay } } }),
    dayItemsForUi(user.condominiumId!, spNow(nowMs()).date),
  ]);

  return (
    <div className="animate-in">
      <PageHeader
        eyebrow={new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(new Date())}
        title={`Bom trabalho, ${user.name.split(" ")[0]}`}
        actions={<LinkButton href="/os/nova"><Plus className="size-4" />Registrar ocorrência</LinkButton>}
      />
      <div className="mb-8 grid grid-cols-3 gap-4">
        <Stat label="Para validar" value={toValidate.length} tone={toValidate.length ? "brand" : undefined} />
        <Stat label="Em andamento" value={inProgress} />
        <Stat label="Abertas hoje" value={today} />
      </div>
      <div className="grid gap-8 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-8">
          <section>
            <h2 className="mb-4 font-display font-semibold text-xl">Aguardando sua validação</h2>
            <OrderList orders={toValidate} empty="Nenhum serviço aguardando validação." />
          </section>
          <section>
            <h2 className="mb-4 font-display font-semibold text-xl">Urgências e atrasos</h2>
            <OrderList orders={urgent} empty="Sem urgências no momento." />
          </section>
        </div>
        <ChecklistToday items={checklist} canCheck condominiumId={user.condominiumId!} footer={<Link href="/checklist" className="text-xs font-medium text-brand hover:underline">Histórico do checklist →</Link>} />
      </div>
    </div>
  );
}
