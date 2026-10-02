import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AlertTriangle, ArrowRight, Building2, CheckCircle2, ClipboardList, ListChecks, Wallet } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { userMemberships } from "@/lib/memberships";
import { ACTIVE_STATUSES } from "@/lib/workflow";
import { ROLE_LABEL, type Role } from "@/lib/roles";
import { checklistForDay } from "@/lib/checklist-server";
import { spNow } from "@/lib/checklist";
import { nowMs } from "@/lib/format";
import { financePeriod } from "@/lib/finance-server";
import { fmtBRL } from "@/lib/finance";
import { openCondo } from "@/app/actions/admin-scope";
import { Badge, Card, PageHeader, buttonClass, cx } from "@/components/ui";

export const metadata: Metadata = { title: "Meus condomínios" };

/** Visão consolidada para quem tem vínculo com vários condomínios (síndico profissional, prestador…). */
export default async function MyCondosPage() {
  const user = await requireUser("syndic", "caretaker", "provider", "council", "resident");
  const ms = await userMemberships(user.id);
  if (ms.length < 2) redirect("/dashboard");
  const now = nowMs();
  const today = spNow(now).date;
  const month = financePeriod({});

  const cards = await Promise.all(
    ms.map(async (m) => {
      const cid = m.condominiumId;
      const role = m.role as Role;
      const staff = role === "syndic" || role === "caretaker";
      const [open, overdue, toApprove, toValidate, mine, checklist, fin] = await Promise.all([
        db.serviceOrder.count({ where: { condominiumId: cid, status: { in: ACTIVE_STATUSES } } }),
        db.serviceOrder.count({ where: { condominiumId: cid, status: { in: ACTIVE_STATUSES }, dueDate: { lt: new Date(now) } } }),
        role === "syndic" ? db.serviceOrder.count({ where: { condominiumId: cid, status: "validated" } }) : 0,
        role === "caretaker" ? db.serviceOrder.count({ where: { condominiumId: cid, status: "completed" } }) : 0,
        role === "provider" ? db.serviceOrder.count({ where: { condominiumId: cid, assignedToId: user.id, status: { in: ["assigned", "in_progress", "rejected"] } } }) : 0,
        staff ? checklistForDay(cid, today) : null,
        role === "syndic"
          ? db.financeEntry.groupBy({ by: ["type"], where: { condominiumId: cid, deletedAt: null, status: "paid", date: { gte: month.from, lt: month.to } }, _sum: { amountCents: true } })
          : null,
      ]);
      const sum = (t: string) => fin?.find((f) => f.type === t)?._sum.amountCents ?? 0;
      return {
        id: cid,
        name: m.condominium.name,
        role,
        active: cid === user.condominiumId,
        open,
        overdue,
        toApprove,
        toValidate,
        mine,
        checklist: checklist ? { done: checklist.filter((i) => i.check).length, total: checklist.length } : null,
        balance: fin ? sum("income") - sum("expense") : null,
      };
    }),
  );

  return (
    <div className="animate-in">
      <PageHeader eyebrow="Visão geral" title="Meus condomínios" description={`Você tem vínculo com ${cards.length} condomínios. Abra um para trabalhar nele.`} />
      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {cards.map((c) => (
          <Card key={c.id} brand={c.active} className="flex flex-col p-5">
            <div className="mb-4 flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand"><Building2 className="size-5" /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-lg font-semibold">{c.name}</p>
                <p className="text-xs text-muted">{ROLE_LABEL[c.role]}</p>
              </div>
              {c.active && <Badge tone="brand" dot>Aberto agora</Badge>}
            </div>

            <dl className="grid flex-1 grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <Item icon={<ClipboardList className="size-4" />} label="OS em aberto" value={c.open} />
              <Item icon={<AlertTriangle className="size-4" />} label="Atrasadas" value={c.overdue} tone={c.overdue ? "text-bad" : undefined} />
              {c.role === "syndic" && <Item icon={<CheckCircle2 className="size-4" />} label="Para aprovar" value={c.toApprove} tone={c.toApprove ? "text-brand" : undefined} />}
              {c.role === "caretaker" && <Item icon={<CheckCircle2 className="size-4" />} label="Para validar" value={c.toValidate} tone={c.toValidate ? "text-brand" : undefined} />}
              {c.role === "provider" && <Item icon={<ClipboardList className="size-4" />} label="A fazer (minhas)" value={c.mine} tone={c.mine ? "text-brand" : undefined} />}
              {c.checklist && c.checklist.total > 0 && (
                <Item icon={<ListChecks className="size-4" />} label="Checklist de hoje" value={`${c.checklist.done}/${c.checklist.total}`} tone={c.checklist.done >= c.checklist.total ? "text-ok" : undefined} />
              )}
              {c.balance != null && <Item icon={<Wallet className="size-4" />} label="Saldo do mês" value={fmtBRL(c.balance)} tone={c.balance < 0 ? "text-bad" : undefined} />}
            </dl>

            <form action={openCondo.bind(null, c.id)} className="mt-5">
              <button className={cx(buttonClass(c.active ? "outline" : "brand"), "w-full")}>
                {c.active ? "Ir para o painel" : "Abrir este condomínio"}<ArrowRight className="size-4" />
              </button>
            </form>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Item({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-xs text-muted">{icon}{label}</dt>
      <dd className={cx("mt-0.5 font-num text-lg font-bold tabular-nums", tone)}>{value}</dd>
    </div>
  );
}
