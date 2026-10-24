import Link from "next/link";
import { ChevronRight, ImageIcon, MapPin } from "lucide-react";
import type { OrderListItem } from "@/lib/orders";
import { locationLabel } from "@/lib/orders";
import { isOverdue } from "@/lib/workflow";
import { fmtDate, fmtRelative } from "@/lib/format";
import { Badge, Card, Empty } from "./ui";
import { PriorityBadge, StatusBadge } from "./order-badges";

export function OrderList({ orders, showCondo, empty = "Nenhuma ordem de serviço encontrada." }: { orders: OrderListItem[]; showCondo?: boolean; empty?: string }) {
  if (!orders.length) return <Card><Empty title={empty} /></Card>;
  return (
    <Card className="overflow-hidden">
      <OrderRows orders={orders} showCondo={showCondo} />
    </Card>
  );
}

/** Linhas da lista (sem card) — para usar dentro de um ScrollCard. */
export function OrderRows({ orders, showCondo, empty = "Nenhuma ordem de serviço encontrada." }: { orders: OrderListItem[]; showCondo?: boolean; empty?: string }) {
  if (!orders.length) return <Empty title={empty} />;
  return (
    <div className="divide-y divide-line">
      {orders.map((o) => (
        <Link key={o.id} href={`/os/${o.id}`} className="group flex items-center gap-3 px-4 py-3.5 transition hover:bg-brand/[0.04] active:bg-bg-2 sm:gap-4 sm:px-5 sm:py-4">
          <span className="w-1 self-stretch rounded-full" style={{ background: o.category?.color ?? "var(--line)" }} />
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="font-num text-xs tracking-wider text-brand">{o.protocol}</span>
              <StatusBadge status={o.status} />
              {o.priority === "urgent" || o.priority === "high" ? <PriorityBadge priority={o.priority} /> : null}
              {isOverdue(o) && <Badge tone="bad">Atrasada</Badge>}
            </div>
            <p className="truncate font-medium group-hover:text-brand">{o.title}</p>
            <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
              <span className="flex items-center gap-1"><MapPin className="size-3" />{locationLabel(o)}</span>
              {o.category && <span>{o.category.name}</span>}
              {o.assignedTo && <span>→ {o.assignedTo.name}</span>}
              {showCondo && <span className="text-fg-2">{o.condominium.name}</span>}
              {o._count.media > 0 && <span className="flex items-center gap-1"><ImageIcon className="size-3" />{o._count.media}</span>}
              <span className="sm:hidden">{fmtRelative(o.createdAt)}</span>
            </p>
          </div>
          <div className="hidden text-right text-xs text-muted sm:block">
            <p>{fmtRelative(o.createdAt)}</p>
            {o.dueDate && <p className="mt-1">Prazo {fmtDate(o.dueDate)}</p>}
          </div>
          <ChevronRight className="size-4 text-muted transition group-hover:translate-x-0.5 group-hover:text-brand" />
        </Link>
      ))}
    </div>
  );
}
