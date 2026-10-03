import Link from "next/link";
import { ChevronRight, PartyPopper } from "lucide-react";
import { db } from "@/lib/db";
import { nowMs } from "@/lib/format";
import { spNow } from "@/lib/checklist";
import { checklistForDay } from "@/lib/checklist-server";
import { daysBetween, fmtDay } from "@/lib/maintenance";
import { cx } from "@/components/ui";

type Item = { badge: string; title: string; hint: string; href: string; tone: "brand" | "warn" | "bad" | "ok" };

// Classes completas (o Tailwind só gera as que aparecem escritas por inteiro)
const COLS: Record<number, string> = { 3: "lg:grid-cols-3", 4: "lg:grid-cols-4" };
const BADGE: Record<Item["tone"], string> = { brand: "bg-brand", warn: "bg-warn", bad: "bg-bad", ok: "bg-ok" };

/**
 * "Pede sua atenção": o que o síndico precisa resolver hoje, com atalhos. Só aparece o que tem pendência;
 * sem nenhuma, uma linha de "tudo em dia".
 */
export async function AttentionStrip({ condominiumId }: { condominiumId: string }) {
  const now = nowMs();
  const today = spNow(now).date;
  const [toApprove, late, docs, overdueBills, checklist] = await Promise.all([
    db.serviceOrder.count({ where: { condominiumId, status: "validated" } }),
    db.serviceOrder.count({ where: { condominiumId, status: { in: ["open", "assigned", "in_progress", "rejected"] }, dueDate: { lt: new Date(now) } } }),
    db.maintenancePlan.findMany({ where: { condominiumId, kind: "document", active: true }, select: { title: true, nextDue: true, leadDays: true }, orderBy: { nextDue: "asc" } }),
    db.financeEntry.count({ where: { condominiumId, deletedAt: null, status: "pending", dueDate: { lt: new Date(now) } } }),
    checklistForDay(condominiumId, today),
  ]);

  const items: Item[] = [];
  if (toApprove) items.push({ badge: String(toApprove), title: toApprove === 1 ? "OS para aprovar" : "OS para aprovar", hint: "validadas pelo zelador", href: "/os?view=approve", tone: "brand" });
  if (late) items.push({ badge: String(late), title: late === 1 ? "OS atrasada" : "OS atrasadas", hint: "passaram do prazo", href: "/os", tone: "bad" });
  const doc = docs.map((d) => ({ ...d, days: daysBetween(today, d.nextDue) })).find((d) => d.days <= d.leadDays);
  if (doc) items.push({ badge: doc.days < 0 ? "!" : `${doc.days}d`, title: doc.days < 0 ? `${doc.title} venceu` : `${doc.title} vence em ${fmtDay(doc.nextDue)}`, hint: doc.days < 0 ? "renove e marque como renovado" : "providencie a renovação", href: "/manutencao", tone: doc.days < 0 ? "bad" : "warn" });
  if (overdueBills) items.push({ badge: String(overdueBills), title: overdueBills === 1 ? "Conta vencida" : "Contas vencidas", hint: "no financeiro", href: "/financeiro", tone: "warn" });
  const done = checklist.filter((i) => i.check).length;
  if (checklist.length && done < checklist.length) items.push({ badge: `${done}/${checklist.length}`, title: "Checklist de hoje", hint: `${checklist.length - done} ${checklist.length - done === 1 ? "item falta" : "itens faltam"}`, href: "/checklist", tone: "ok" });

  if (!items.length) {
    return (
      <p className="mb-6 flex items-center gap-2.5 rounded-2xl bg-ok/10 px-4 py-3 text-sm text-fg-2 ring-1 ring-inset ring-ok/15">
        <PartyPopper className="size-4 shrink-0 text-ok" /> <b className="text-fg">Tudo em dia.</b> Nada pendente para você agora.
      </p>
    );
  }
  const shown = items.slice(0, 4);
  return (
    <section aria-label="Pede sua atenção" className="mb-6 rounded-2xl bg-fg p-4 text-bg sm:p-5">
      <p className="mb-3 text-[15px] font-bold">
        {shown.length === 1 ? "1 coisa pede sua atenção hoje" : `${shown.length} coisas pedem sua atenção hoje`}
      </p>
      <div className={cx("grid gap-2.5", shown.length > 1 && "sm:grid-cols-2", COLS[shown.length])}>
        {shown.map((it) => (
          <Link key={it.title} href={it.href} className="flex min-h-11 items-center gap-3 rounded-xl bg-bg/10 px-3.5 py-3 transition hover:bg-bg/15">
            <span className={cx("flex h-9 min-w-9 shrink-0 items-center justify-center rounded-lg px-1.5 font-num text-[13px] font-extrabold text-white", BADGE[it.tone])}>{it.badge}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{it.title}</span>
              <span className="block truncate text-xs text-bg/65">{it.hint}</span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-bg/60" />
          </Link>
        ))}
      </div>
    </section>
  );
}
