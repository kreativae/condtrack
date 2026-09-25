import Link from "next/link";
import { AlertTriangle, CheckCircle2, ListChecks } from "lucide-react";
import { db } from "@/lib/db";
import { nowMs } from "@/lib/format";
import { deadlineMinutes, spNow } from "@/lib/checklist";
import { dayItemsForUi } from "@/lib/checklist-server";
import { Card, cx } from "@/components/ui";

/** Resumo do checklist de hoje para o síndico (painel). */
export async function ChecklistSummary({ condominiumId }: { condominiumId: string }) {
  const now = spNow(nowMs());
  const [items, condo] = await Promise.all([
    dayItemsForUi(condominiumId, now.date),
    db.condominium.findUnique({ where: { id: condominiumId }, select: { checklistDeadline: true } }),
  ]);
  if (!items.length) return null;
  const done = items.filter((i) => i.check).length;
  const issues = items.filter((i) => i.check?.status === "issue");
  const limit = deadlineMinutes(condo?.checklistDeadline);
  const late = limit != null && now.minutes >= limit && done < items.length;
  const pct = Math.round((done / items.length) * 100);

  return (
    <Card className="mb-8 p-5">
      <div className="flex flex-wrap items-center gap-4">
        <span className={cx("flex size-10 items-center justify-center rounded-xl", late ? "bg-bad/10 text-bad" : done === items.length ? "bg-ok/10 text-ok" : "bg-brand-soft text-brand")}>
          {done === items.length ? <CheckCircle2 className="size-5" /> : <ListChecks className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display font-semibold">Checklist de hoje</p>
          <p className="text-sm text-muted">
            {done} de {items.length} conferidos
            {condo?.checklistDeadline && ` · limite ${condo.checklistDeadline}`}
            {late && <span className="font-medium text-bad"> · atrasado</span>}
          </p>
        </div>
        <Link href="/checklist" className="text-sm font-medium text-brand hover:underline">Ver checklist →</Link>
      </div>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-bg-2">
        <div className={cx("h-full rounded-full", issues.length ? "bg-warn" : "bg-ok")} style={{ width: `${pct}%` }} />
      </div>
      {issues.length > 0 && (
        <ul className="mt-4 space-y-2">
          {issues.map((i) => (
            <li key={i.id} className="flex items-start gap-2 rounded-xl bg-bad/[0.06] px-3 py-2 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-bad" />
              <span className="min-w-0 flex-1">
                <b className="font-medium">{i.title}</b>
                {i.check?.note && <span className="text-fg-2"> — {i.check.note}</span>}
                <span className="block text-xs text-muted">{i.check?.by}</span>
              </span>
              {i.check?.order && <Link href={`/os/${i.check.order.id}`} className="shrink-0 text-xs font-medium text-brand hover:underline">{i.check.order.protocol}</Link>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
