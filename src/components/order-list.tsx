import Link from "next/link";
import { ChevronRight, ImageIcon, MapPin } from "lucide-react";
import type { OrderListItem } from "@/lib/orders";
import { locationLabel } from "@/lib/orders";
import { STATUS_META, type Status } from "@/lib/workflow";
import { fmtDate, nowMs } from "@/lib/format";
import { categoryIcon } from "@/lib/category-icons";
import { daysBetween } from "@/lib/maintenance";
import { Avatar, Badge, Card, Empty, cx, type Tone } from "./ui";
import { PriorityBadge } from "./order-badges";

export function OrderList({ orders, showCondo, empty = "Nenhuma ordem de serviço encontrada." }: { orders: OrderListItem[]; showCondo?: boolean; empty?: string }) {
  if (!orders.length) return <Card><Empty title={empty} /></Card>;
  return (
    <Card className="overflow-hidden">
      <OrderRows orders={orders} showCondo={showCondo} />
    </Card>
  );
}

/** Quantas das 6 etapas (abertura → aprovação) a OS já cumpriu. Devolvida volta para a execução. */
const DONE_STEPS: Record<string, number> = { open: 1, assigned: 2, in_progress: 2, rejected: 2, completed: 4, validated: 5, approved: 6, cancelled: 0 };

const dayOf = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);

/** Prazo em linguagem simples, com o tom: atrasada, vence hoje/amanhã, vence em N dias. */
function dueChip(o: OrderListItem, today: string): { text: string; tone: Tone } {
  if (o.status === "approved") return { text: o.approvedAt ? `Aprovada ${fmtDate(o.approvedAt)}` : "Aprovada", tone: "ok" };
  if (o.status === "cancelled") return { text: "Cancelada", tone: "muted" };
  if (!o.dueDate) return { text: "Sem prazo", tone: "muted" };
  const days = daysBetween(today, dayOf(o.dueDate));
  if (days < 0) return { text: `Atrasada ${-days} ${days === -1 ? "dia" : "dias"}`, tone: "bad" };
  if (days === 0) return { text: "Vence hoje", tone: "warn" };
  if (days === 1) return { text: "Vence amanhã", tone: "warn" };
  return { text: `Vence em ${days} dias`, tone: "ok" };
}

/** Linhas da lista (sem card) — para usar dentro de um ScrollCard. */
export function OrderRows({ orders, showCondo, empty = "Nenhuma ordem de serviço encontrada." }: { orders: OrderListItem[]; showCondo?: boolean; empty?: string }) {
  if (!orders.length) return <Empty title={empty} />;
  const today = dayOf(new Date(nowMs()));
  return (
    <div className="divide-y divide-line">
      {orders.map((o) => {
        const Icon = categoryIcon(o.category?.icon);
        const color = o.category?.color ?? "var(--muted)";
        const done = DONE_STEPS[o.status] ?? 0;
        const due = dueChip(o, today);
        const steps = (
          <span className="flex items-center gap-[3px]" aria-label={`Etapa ${Math.max(done, 1)} de 6: ${STATUS_META[o.status as Status]?.label ?? o.status}`}>
            {Array.from({ length: 6 }, (_, k) => (
              <span
                key={k}
                className={cx(
                  "h-1.5 w-4 rounded-full",
                  o.status === "cancelled" ? "bg-line" : k < done ? (o.status === "rejected" ? "bg-bad" : "bg-brand") : k === done && o.status !== "approved" ? "bg-brand/35" : "bg-line",
                )}
              />
            ))}
          </span>
        );
        return (
          <Link key={o.id} href={`/os/${o.id}`} className="group flex items-center gap-3.5 px-4 py-3.5 transition hover:bg-brand/[0.04] sm:px-5">
            {/* Ícone da categoria na cor dela */}
            <span className="flex size-10 shrink-0 items-center justify-center self-start rounded-xl sm:self-center" style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}>
              <Icon className="size-[18px]" strokeWidth={1.9} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="mb-0.5 flex flex-wrap items-center gap-2">
                <span className="font-num text-xs tracking-wider text-brand">{o.protocol}</span>
                {o.priority === "urgent" || o.priority === "high" ? <PriorityBadge priority={o.priority} /> : null}
              </div>
              <p className="truncate font-semibold group-hover:text-brand">{o.title}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                <span className="flex items-center gap-1"><MapPin className="size-3" />{locationLabel(o)}</span>
                {o.category && <span>{o.category.name}</span>}
                {showCondo && <span className="text-fg-2">{o.condominium.name}</span>}
                {o._count.media > 0 && <span className="flex items-center gap-1"><ImageIcon className="size-3" />{o._count.media}</span>}
              </p>
              {/* Celular: etapas e prazo abaixo do título */}
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 lg:hidden">
                {steps}
                <span className="text-xs font-medium text-fg-2">{STATUS_META[o.status as Status]?.label}</span>
                <Badge tone={due.tone}>{due.text}</Badge>
              </div>
            </div>
            {/* Computador: etapa, prestador e prazo em colunas */}
            <div className="hidden w-44 shrink-0 flex-col gap-1.5 lg:flex">
              {steps}
              <span className="truncate text-xs font-medium text-fg-2">{STATUS_META[o.status as Status]?.label}</span>
            </div>
            <div className="hidden w-44 shrink-0 items-center gap-2 lg:flex">
              {o.assignedTo ? (
                <>
                  <Avatar name={o.assignedTo.name} size={26} />
                  <span className="min-w-0 truncate text-xs text-fg-2">{o.assignedTo.name}</span>
                </>
              ) : (
                <span className="text-xs text-muted">Sem prestador</span>
              )}
            </div>
            <div className="hidden w-36 shrink-0 lg:block"><Badge tone={due.tone}>{due.text}</Badge></div>
            <ChevronRight className="size-4 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-brand" />
          </Link>
        );
      })}
    </div>
  );
}
