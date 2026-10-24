import { Plus } from "lucide-react";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth";
import { orderListInclude } from "@/lib/orders";
import { ACTIVE_STATUSES } from "@/lib/workflow";
import { OrderList } from "@/components/order-list";
import { LinkButton, PageHeader, Stat, cx } from "@/components/ui";
import Link from "next/link";
import { ChecklistToday } from "@/components/checklist/today";
import { dayItemsForUi } from "@/lib/checklist-server";
import { spNow } from "@/lib/checklist";
import { DashboardSettings } from "@/components/dashboard-settings";
import { DASHBOARD_SECTIONS, dashboardVisibility } from "@/lib/dashboard";
import { feedInclude } from "@/components/feed-card";
import { ServiceShowcase } from "@/components/service-card";

import { nowMs } from "@/lib/format";

export async function CaretakerDashboard({ user }: { user: CurrentUser }) {
  const show = dashboardVisibility(user.dashboardHidden);
  const where = { condominiumId: user.condominiumId! };
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const [toValidate, urgent, inProgress, today, checklist, delivered] = await Promise.all([
    db.serviceOrder.findMany({ where: { ...where, status: "completed" }, include: orderListInclude, orderBy: { completedAt: "asc" } }),
    db.serviceOrder.findMany({ where: { ...where, status: { in: ACTIVE_STATUSES }, OR: [{ priority: "urgent" }, { dueDate: { lt: new Date() } }] }, include: orderListInclude, orderBy: { dueDate: "asc" } }),
    db.serviceOrder.count({ where: { ...where, status: "in_progress" } }),
    db.serviceOrder.count({ where: { ...where, createdAt: { gte: startOfDay } } }),
    dayItemsForUi(user.condominiumId!, spNow(nowMs()).date),
    show("delivered") ? db.serviceOrder.findMany({ where: { ...where, status: "approved" }, include: feedInclude, orderBy: { approvedAt: "desc" }, take: 4 }) : [],
  ]);

  return (
    <div className="animate-in">
      <PageHeader
        eyebrow={new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(new Date())}
        title={`Bom trabalho, ${user.name.split(" ")[0]}`}
        actions={<><DashboardSettings sections={DASHBOARD_SECTIONS.caretaker} hidden={user.dashboardHidden.split(",").filter(Boolean)} /><LinkButton href="/os/nova"><Plus className="size-4" />Registrar ocorrência</LinkButton></>}
      />
      {show("stats") && (
      <div className="mb-6 grid grid-cols-3 gap-3 sm:mb-8 sm:gap-4">
        <Stat label="Para validar" value={toValidate.length} tone={toValidate.length ? "brand" : undefined} href="/os?view=validate" />
        <Stat label="Em andamento" value={inProgress} href="/os?status=in_progress" />
        <Stat label="Abertas hoje" value={today} href="/os" />
      </div>
      )}
      <div className={cx("grid gap-8", (show("validate") || show("urgent")) && show("checklist") && "lg:grid-cols-[1.5fr_1fr]")}>
        {(show("validate") || show("urgent")) && (
        <div className="space-y-8">
          {show("validate") && (
          <section>
            <h2 className="mb-4 font-display font-semibold text-xl">Aguardando sua validação</h2>
            <OrderList orders={toValidate} empty="Nenhum serviço aguardando validação." />
          </section>
          )}
          {show("urgent") && (
          <section>
            <h2 className="mb-4 font-display font-semibold text-xl">Urgências e atrasos</h2>
            <OrderList orders={urgent} empty="Sem urgências no momento." />
          </section>
          )}
        </div>
        )}
        {/* No celular o checklist do dia vem primeiro: é a rotina do zelador */}
        {show("checklist") && <div className="max-lg:order-first"><ChecklistToday items={checklist} canCheck condominiumId={user.condominiumId!} footer={<Link href="/checklist" className="text-xs font-medium text-brand hover:underline">Histórico do checklist →</Link>} /></div>}
      </div>

      {show("delivered") && delivered.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 flex items-center gap-3 font-display text-xl font-semibold">
            Serviços entregues
            <Link href="/feed" className="ml-auto text-xs font-medium text-brand hover:underline">Ver feed</Link>
          </h2>
          <ServiceShowcase items={delivered} />
        </section>
      )}
    </div>
  );
}
