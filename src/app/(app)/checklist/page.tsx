import type { Metadata } from "next";
import Link from "next/link";
import { Settings2 } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { nowMs } from "@/lib/format";
import { addDays, fmtDay, isDue, spNow } from "@/lib/checklist";
import { dayItemsForUi } from "@/lib/checklist-server";
import { ChecklistToday } from "@/components/checklist/today";
import { LinkButton, PageHeader, Select, buttonClass, cx } from "@/components/ui";

export const metadata: Metadata = { title: "Checklist" };

const DAYS = 14;

export default async function ChecklistPage({ searchParams }: PageProps<"/checklist">) {
  const user = await requireUser("superadmin", "syndic", "caretaker");
  const sp = await searchParams;
  const admin = user.role === "superadmin";
  const condos = admin ? await db.condominium.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [];
  const condominiumId = admin ? (condos.find((c) => c.id === sp.condo)?.id ?? condos[0]?.id) : user.condominiumId!;
  if (!condominiumId) return <PageHeader title="Checklist do zelador" description="Nenhum condomínio ativo." />;
  const condoName = admin ? condos.find((c) => c.id === condominiumId)?.name : user.condominium?.name;

  const today = spNow(nowMs()).date;
  const date = typeof sp.data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.data) && sp.data <= today ? sp.data : today;
  const from = addDays(today, -(DAYS - 1));

  // Resumo dos últimos dias: itens devidos (ou conferidos) em cada data
  const [items, checks, day] = await Promise.all([
    db.checklistItem.findMany({ where: { condominiumId }, select: { id: true, active: true, frequency: true, weekdays: true, createdAt: true } }),
    db.checklistCheck.findMany({ where: { condominiumId, date: { gte: from, lte: today } }, select: { itemId: true, date: true, status: true } }),
    dayItemsForUi(condominiumId, date),
  ]);
  const summary = Array.from({ length: DAYS }, (_, i) => {
    const d = addDays(today, -i);
    const dayChecks = checks.filter((c) => c.date === d);
    const due = items.filter((it) => dayChecks.some((c) => c.itemId === it.id) || (it.active && isDue(it, d) && it.createdAt.toISOString().slice(0, 10) <= d)).length;
    return { d, due, done: dayChecks.length, issues: dayChecks.filter((c) => c.status === "issue").length };
  });

  const q = (d: string) => `/checklist?${new URLSearchParams({ ...(admin ? { condo: condominiumId } : {}), ...(d !== today ? { data: d } : {}) })}`;
  const manage = user.role === "caretaker" ? null : admin ? `/admin/condominios/${condominiumId}/estrutura?tab=checklist` : "/estrutura?tab=checklist";

  return (
    <div className="animate-in">
      <PageHeader
        eyebrow={condoName}
        title="Checklist do zelador"
        description="Conferência diária das áreas e equipamentos do condomínio."
        actions={manage && <LinkButton href={manage} variant="outline"><Settings2 className="size-4" />Gerenciar itens</LinkButton>}
      />
      {admin && (
        <form className="mb-6 flex max-w-md gap-2">
          <Select name="condo" defaultValue={condominiumId} className="flex-1">
            {condos.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <button className={buttonClass("outline")}>Ver</button>
        </form>
      )}

      <div className="no-scrollbar -mx-4 mb-6 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {summary.map((s) => {
          const complete = s.due > 0 && s.done >= s.due;
          return (
            <Link
              key={s.d}
              href={q(s.d)}
              className={cx("w-[88px] shrink-0 rounded-xl border px-3 py-2 text-center transition", s.d === date ? "border-brand bg-brand-soft" : "border-line bg-surface hover:bg-bg-2")}
            >
              <p className="text-[11px] font-medium capitalize text-muted">{s.d === today ? "Hoje" : new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${s.d}T12:00:00Z`))}</p>
              <p className={cx("font-num text-lg font-semibold", !s.due ? "text-muted" : s.issues ? "text-warn" : complete ? "text-ok" : s.d < today ? "text-bad" : "text-fg")}>
                {s.due ? `${s.done}/${s.due}` : "—"}
              </p>
              <p className="text-[10px] text-muted">{s.issues ? `${s.issues} problema(s)` : complete ? "completo" : s.due ? (s.d < today ? "incompleto" : "em andamento") : "sem itens"}</p>
            </Link>
          );
        })}
      </div>

      <div className="max-w-2xl">
        <ChecklistToday
          items={day}
          canCheck={date === today}
          condominiumId={condominiumId}
          title={date === today ? "Checklist de hoje" : `Checklist de ${fmtDay(date)}`}
        />
      </div>
    </div>
  );
}
