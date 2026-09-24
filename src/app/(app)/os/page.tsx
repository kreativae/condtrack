import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Plus, Search } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { orderListInclude, orderScope } from "@/lib/orders";
import { ACTIVE_STATUSES, PRIORITY_META, STATUS_META, STATUSES } from "@/lib/workflow";
import { OrderRows } from "@/components/order-list";
import { FrozenPage, FrozenTop, Pager, ScrollCard, pageParam, withPage } from "@/components/frozen";
import { Alert, Input, LinkButton, PageHeader, Select, buttonClass, cx } from "@/components/ui";

export const metadata: Metadata = { title: "Ordens de serviço" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const PAGE = 50;

export default async function OrdersPage({ searchParams }: PageProps<"/os">) {
  const user = await requireUser("superadmin", "syndic", "caretaker", "provider", "council");
  const sp = await searchParams;
  const q = one(sp.q).trim();
  const status = one(sp.status);
  const priority = one(sp.priority);
  const category = one(sp.category);
  const history = one(sp.h) === "1";
  const view = one(sp.view) || (history ? "done" : "active");

  const where: Prisma.ServiceOrderWhereInput = { AND: [orderScope(user)] };
  const and = where.AND as Prisma.ServiceOrderWhereInput[];
  if (status) and.push({ status });
  else if (view === "active") and.push({ status: { in: ACTIVE_STATUSES } });
  else if (view === "done") and.push({ status: { in: ["approved", "cancelled"] } });
  if (user.role === "caretaker" && view === "validate") and.push({ status: "completed" });
  if (user.role === "syndic" && view === "approve") and.push({ status: "validated" });
  if (priority) and.push({ priority });
  if (category) and.push({ categoryId: category });
  if (q) and.push({ OR: [{ title: { contains: q, mode: "insensitive" } }, { protocol: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] });

  const total = await db.serviceOrder.count({ where });
  const page = pageParam(sp.page, total, PAGE);
  const [orders, categories] = await Promise.all([
    db.serviceOrder.findMany({ where, include: orderListInclude, orderBy: [{ createdAt: "desc" }], skip: (page - 1) * PAGE, take: PAGE }),
    user.condominiumId ? db.serviceCategory.findMany({ where: { condominiumId: user.condominiumId }, orderBy: { name: "asc" } }) : [],
  ]);

  const tabs: [string, string][] = [
    ["active", "Em aberto"],
    ...(user.role === "caretaker" ? ([["validate", "Para validar"]] as [string, string][]) : []),
    ...(user.role === "syndic" || user.role === "superadmin" ? ([["approve", "Para aprovar"]] as [string, string][]) : []),
    ["done", "Finalizadas"],
    ["all", "Todas"],
  ];
  const canCreate = user.role !== "provider";
  const title = { council: "Minhas solicitações", provider: history ? "Meu histórico" : "Minhas OS" }[user.role as string] ?? "Ordens de serviço";

  return (
    <FrozenPage>
      <FrozenTop>
        <PageHeader
          eyebrow="Serviços"
          title={title}
          description={`${total} resultado(s)`}
          actions={canCreate && <LinkButton href="/os/nova"><Plus className="size-4" /> {user.role === "council" ? "Nova solicitação" : "Nova OS"}</LinkButton>}
        />

        {one(sp.excluida) && <div className="mb-4"><Alert tone="ok">OS {one(sp.excluida)} excluída.</Alert></div>}
        <div className="mb-4 no-scrollbar flex gap-1 overflow-x-auto border-b border-line">
          {tabs.map(([k, label]) => (
            <Link
              key={k}
              href={`/os?view=${k}${history ? "&h=1" : ""}`}
              className={cx("-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm transition", view === k && !status ? "border-brand text-brand" : "border-transparent text-muted hover:text-fg")}
            >
              {label}
            </Link>
          ))}
        </div>

        <form className="mb-4 flex flex-col gap-2 sm:grid sm:grid-cols-[1fr_auto_auto_auto_auto]">
          <input type="hidden" name="view" value={view} />
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input name="q" defaultValue={q} placeholder="Buscar por título, protocolo…" className="pl-9" />
          </div>
          {/* No celular os filtros viram uma faixa com rolagem horizontal */}
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:contents [&>*]:min-w-36 sm:[&>*]:min-w-0">
            <Select name="status" defaultValue={status}>
              <option value="">Status</option>
              {STATUSES.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
            </Select>
            <Select name="priority" defaultValue={priority}>
              <option value="">Prioridade</option>
              {Object.entries(PRIORITY_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>
            {categories.length > 0 && (
              <Select name="category" defaultValue={category}>
                <option value="">Categoria</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            )}
            <button className={buttonClass("outline")}>Filtrar</button>
          </div>
        </form>
      </FrozenTop>

      <ScrollCard footer={<Pager page={page} pageSize={PAGE} total={total} href={(p) => withPage("/os", sp, p)} />}>
        <OrderRows orders={orders} showCondo={user.role === "superadmin"} />
      </ScrollCard>
    </FrozenPage>
  );
}
