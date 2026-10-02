import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, Rows3, Settings2 } from "lucide-react";
import { db } from "@/lib/db";
import { inCondo } from "@/lib/memberships";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { RememberCondo } from "@/components/remember-condo";
import { ADMIN_CONDO_COOKIE } from "@/lib/admin-scope";
import { nowMs } from "@/lib/format";
import { addDays, fmtDay, isDue, spNow } from "@/lib/checklist";
import { dayItemsForUi } from "@/lib/checklist-server";
import { ChecklistToday } from "@/components/checklist/today";
import { DayGallery, DayNotes, type DayPhoto } from "@/components/checklist/day-notes";
import { LinkButton, PageHeader, Select, buttonClass, cx } from "@/components/ui";

export const metadata: Metadata = { title: "Checklist" };

const DAYS = 14;

export default async function ChecklistPage({ searchParams }: PageProps<"/checklist">) {
  const user = await requireUser("superadmin", "syndic", "caretaker");
  const sp = await searchParams;
  const admin = user.role === "superadmin";
  const condos = admin ? await db.condominium.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [];
  // Superadmin: o escolhido, senão o último aberto (Financeiro/Checklist), senão o primeiro
  const last = admin ? (await cookies()).get(ADMIN_CONDO_COOKIE)?.value : undefined;
  const condominiumId = admin ? (condos.find((c) => c.id === sp.condo)?.id ?? condos.find((c) => c.id === last)?.id ?? condos[0]?.id) : user.condominiumId!;
  if (!condominiumId) return <PageHeader title="Checklist do zelador" description="Nenhum condomínio ativo." />;
  const condoName = admin ? condos.find((c) => c.id === condominiumId)?.name : user.condominium?.name;

  const today = spNow(nowMs()).date;
  const date = typeof sp.data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.data) && sp.data <= today ? sp.data : today;
  const from = addDays(today, -(DAYS - 1));
  // Calendário: o mês escolhido (?mes=) ou o do dia aberto
  const cal = sp.cal === "1";
  const mes = typeof sp.mes === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.mes) && sp.mes <= today.slice(0, 7) ? sp.mes : date.slice(0, 7);
  const monthStart = `${mes}-01`;
  const monthEnd = addDays(nextMonth(mes) + "-01", -1);
  const rangeFrom = cal && monthStart < from ? monthStart : from;

  // Resumo dos últimos dias: itens devidos (ou conferidos) em cada data
  const [items, checks, day, notes] = await Promise.all([
    db.checklistItem.findMany({ where: { condominiumId }, select: { id: true, active: true, frequency: true, weekdays: true, createdAt: true } }),
    db.checklistCheck.findMany({ where: { condominiumId, date: { gte: rangeFrom, lte: today } }, select: { itemId: true, date: true, status: true } }),
    dayItemsForUi(condominiumId, date),
    db.checklistNote.findMany({ where: { condominiumId, date }, orderBy: { createdAt: "desc" } }),
  ]);
  const noteDays = cal
    ? new Set((await db.checklistNote.groupBy({ by: ["date"], where: { condominiumId, date: { gte: monthStart, lte: monthEnd } } })).map((n) => n.date))
    : new Set<string>();
  const notePhotos = (json: string) => {
    try {
      const v = JSON.parse(json);
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
    } catch {
      return [];
    }
  };
  const dayNotes = notes.map((n) => ({
    id: n.id,
    text: n.text,
    photos: notePhotos(n.photos),
    by: n.userName,
    userId: n.userId,
    at: n.createdAt.toISOString(),
    // Quem escreveu, o síndico ou o superadmin
    deletable: n.userId === user.id || user.role !== "caretaker",
  }));
  // Galeria: fotos das conferências + das anotações, em ordem de horário
  const gallery: DayPhoto[] = [
    ...day.filter((i) => i.check?.photoUrl).map((i) => ({ id: `c-${i.id}`, url: i.check!.photoUrl!, caption: i.title, by: i.check!.by, at: i.check!.at })),
    ...dayNotes.flatMap((n) => n.photos.map((url, k) => ({ id: `n-${n.id}-${k}`, url, caption: "Anotação do dia", by: n.by, at: n.at }))),
  ].sort((a, b) => a.at.localeCompare(b.at));
  /** Situação de um dia: itens devidos (ou conferidos), conferidos e com problema. */
  const stat = (d: string) => {
    const dayChecks = checks.filter((c) => c.date === d);
    const due = items.filter((it) => dayChecks.some((c) => c.itemId === it.id) || (it.active && isDue(it, d) && it.createdAt.toISOString().slice(0, 10) <= d)).length;
    return { d, due, done: dayChecks.length, issues: dayChecks.filter((c) => c.status === "issue").length };
  };
  const summary = Array.from({ length: DAYS }, (_, i) => stat(addDays(today, -i)));

  // Links mantêm condomínio (superadmin) e o modo calendário
  const q = (d: string, over: Record<string, string> = {}) =>
    `/checklist?${new URLSearchParams({ ...(admin ? { condo: condominiumId } : {}), ...(d !== today ? { data: d } : {}), ...(cal ? { cal: "1", mes } : {}), ...over })}`;
  const toggleHref = cal
    ? `/checklist?${new URLSearchParams({ ...(admin ? { condo: condominiumId } : {}), ...(date !== today ? { data: date } : {}) })}`
    : q(date, { cal: "1", mes: date.slice(0, 7) });
  const manage = user.role === "caretaker" ? null : admin ? `/admin/condominios/${condominiumId}/estrutura?tab=checklist` : "/estrutura?tab=checklist";

  // Superadmin e síndico com permissão: corrigem conferências (autor, horário, retroativas) e anotações
  const canEdit = hasPermission(user, "checklist_edit");
  const editor = canEdit
    ? {
        date,
        meId: user.id,
        users: [
          ...(await db.user.findMany({ where: { ...inCondo(condominiumId, ["caretaker", "syndic"]), status: "active" }, select: { id: true, name: true }, orderBy: { name: "asc" } })),
          ...(admin ? [{ id: user.id, name: user.name }] : []),
        ],
      }
    : undefined;

  const calendar = cal && <MonthCalendar mes={mes} today={today} selected={date} stat={stat} notes={noteDays} href={(d) => q(d)} monthHref={(m) => q(date, { mes: m })} />;

  return (
    <div className="animate-in">
      {admin && <RememberCondo id={condominiumId} />}
      <PageHeader
        eyebrow={condoName}
        title="Checklist do zelador"
        description="Conferência diária das áreas e equipamentos do condomínio."
        actions={
          <>
            <LinkButton href={toggleHref} variant="outline">{cal ? <><Rows3 className="size-4" />Últimos dias</> : <><CalendarDays className="size-4" />Calendário</>}</LinkButton>
            {manage && <LinkButton href={manage} variant="outline"><Settings2 className="size-4" />Gerenciar itens</LinkButton>}
          </>
        }
      />
      {admin && (
        <form className="mb-6 flex max-w-md gap-2">
          <Select name="condo" defaultValue={condominiumId} className="flex-1">
            {condos.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <button className={buttonClass("outline")}>Ver</button>
        </form>
      )}

      {cal ? (
        <div className="mb-6 lg:hidden">{calendar}</div>
      ) : (
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
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <ChecklistToday
          items={day}
          canCheck={date === today}
          condominiumId={condominiumId}
          editor={editor}
          title={date === today ? "Checklist de hoje" : `Checklist de ${fmtDay(date)}`}
        />
        <div className="space-y-6">
          {cal && <div className="hidden lg:block">{calendar}</div>}
          <DayNotes notes={dayNotes} condominiumId={condominiumId} date={date} canWrite={date === today || canEdit} editor={editor} />
          <DayGallery photos={gallery} />
        </div>
      </div>
    </div>
  );
}

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function nextMonth(mes: string) {
  const [y, m] = mes.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}
function prevMonth(mes: string) {
  const [y, m] = mes.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

type DayStat = { d: string; due: number; done: number; issues: number };

/** Calendário compacto: número do dia + ponto da situação; clicar abre o dia. */
function MonthCalendar({ mes, today, selected, stat, notes, href, monthHref }: {
  mes: string;
  today: string;
  selected: string;
  stat: (d: string) => DayStat;
  notes: Set<string>;
  href: (d: string) => string;
  monthHref: (m: string) => string;
}) {
  const first = `${mes}-01`;
  const lead = new Date(`${first}T12:00:00Z`).getUTCDay(); // 0 = domingo
  const days: string[] = [];
  for (let d = first; d.startsWith(mes); d = addDays(d, 1)) days.push(d);
  const [y, m] = mes.split("-").map(Number);
  const canNext = nextMonth(mes) <= today.slice(0, 7);
  const arrow = "inline-flex size-7 items-center justify-center rounded-lg text-muted transition hover:bg-bg-2 hover:text-fg";
  const DOT = { ok: "bg-ok", bad: "bg-bad", warn: "bg-warn", open: "bg-muted/50", none: "" } as const;

  return (
    <div className="rounded-2xl border border-line bg-surface p-4 shadow-card">
      <div className="mb-3 flex items-center gap-1">
        <p className="mr-auto text-sm font-semibold">{MONTHS[m - 1]} <span className="font-normal text-muted">{y}</span></p>
        {mes !== today.slice(0, 7) && <Link href={monthHref(today.slice(0, 7))} className="mr-1 text-xs font-medium text-brand hover:underline">Hoje</Link>}
        <Link href={monthHref(prevMonth(mes))} className={arrow} aria-label="Mês anterior"><ChevronLeft className="size-4" /></Link>
        {canNext ? (
          <Link href={monthHref(nextMonth(mes))} className={arrow} aria-label="Próximo mês"><ChevronRight className="size-4" /></Link>
        ) : (
          <span className={cx(arrow, "pointer-events-none opacity-30")}><ChevronRight className="size-4" /></span>
        )}
      </div>

      <div className="grid grid-cols-7 gap-y-0.5 text-center">
        {["D", "S", "T", "Q", "Q", "S", "S"].map((w, i) => <p key={i} className="pb-1.5 text-[10px] font-medium text-muted">{w}</p>)}
        {Array.from({ length: lead }, (_, i) => <span key={`e${i}`} />)}
        {days.map((d) => {
          const future = d > today;
          const s = future ? null : stat(d);
          const complete = !!s && s.due > 0 && s.done >= s.due;
          const tone = !s || !s.due ? "none" : s.issues ? "warn" : complete ? "ok" : d < today ? "bad" : "open";
          const sel = d === selected;
          const label = s?.due ? `${s.done} de ${s.due} conferidos${s.issues ? ` · ${s.issues} com problema` : ""}` : "Sem itens";
          const inner = (
            <>
              <span className={cx("flex size-8 items-center justify-center rounded-full text-xs tabular-nums transition", sel ? "bg-brand font-semibold text-brand-ink" : d === today ? "font-semibold text-brand ring-1 ring-brand/40" : "text-fg-2", !future && !sel && "group-hover:bg-bg-2")}>
                {Number(d.slice(8))}
              </span>
              <span className="flex h-1.5 items-center gap-0.5">
                {tone !== "none" && <span className={cx("size-1 rounded-full", DOT[tone])} />}
                {notes.has(d) && <span className="size-1 rounded-full bg-brand" />}
              </span>
            </>
          );
          return future ? (
            <span key={d} className="flex flex-col items-center opacity-30">{inner}</span>
          ) : (
            <Link key={d} href={href(d)} title={`${d.split("-").reverse().join("/")} · ${label}${notes.has(d) ? " · com anotações" : ""}`} className="group flex flex-col items-center">
              {inner}
            </Link>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap justify-center gap-x-3 gap-y-1 border-t border-line pt-3 text-[10px] text-muted">
        <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-ok" />Completo</span>
        <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-bad" />Incompleto</span>
        <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-warn" />Problema</span>
        <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-brand" />Anotação</span>
      </div>
    </div>
  );
}
