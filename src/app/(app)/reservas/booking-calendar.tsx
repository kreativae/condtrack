"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Lock, Plus } from "lucide-react";
import { buttonClass, cx } from "@/components/ui";
import { BOOKING_STATUS, areaColor, brt, brtParts, monthGrid, shiftMonthKey, type BookingStatus } from "@/lib/booking";

export type CalArea = { id: string; name: string; openTime: string | null; closeTime: string | null };
/** `id` só vem quando a pessoa pode abrir a reserva; `label` = unidade (ou "Reservado" para quem não é dono). */
export type CalEvent = { id: string | null; areaId: string; startAt: string; endAt: string; status: string; label: string; mine: boolean };

const WEEK = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** Agenda do mês com as reservas de todas as áreas; clicar num dia mostra os horários e o botão de reservar. */
export function BookingCalendar({ month, today, areas, events, canBook }: { month: string; today: string; areas: CalArea[]; events: CalEvent[]; canBook: boolean }) {
  const days = useMemo(() => monthGrid(month), [month]);
  const [selected, setSelected] = useState(today.startsWith(month) ? today : `${month}-01`);
  const [filter, setFilter] = useState<string | null>(null);
  const colorOf = (areaId: string) => areaColor(Math.max(0, areas.findIndex((a) => a.id === areaId)));
  const visible = filter ? events.filter((e) => e.areaId === filter) : events;

  // Reservas de cada dia (a que vira a noite aparece nos dois dias)
  const byDay = useMemo(() => {
    const map = new Map<string, CalEvent[]>();
    for (const d of days) {
      const from = brt(d, "00:00").getTime();
      const to = from + 86400_000;
      map.set(d, visible.filter((e) => new Date(e.startAt).getTime() < to && new Date(e.endAt).getTime() > from).sort((a, b) => a.startAt.localeCompare(b.startAt)));
    }
    return map;
  }, [days, visible]);

  const [y, m] = month.split("-").map(Number);
  const dayEvents = byDay.get(selected) ?? [];
  const sel = new Date(`${selected}T12:00:00-03:00`);
  const selLabel = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "numeric", month: "long" }).format(sel);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Link href={`/reservas?mes=${shiftMonthKey(month, -1)}`} className={buttonClass("outline", "sm")} aria-label="Mês anterior"><ChevronLeft className="size-4" /></Link>
          <p className="min-w-36 text-center font-display text-lg font-semibold">{MONTHS[m - 1][0].toUpperCase() + MONTHS[m - 1].slice(1)} {y}</p>
          <Link href={`/reservas?mes=${shiftMonthKey(month, 1)}`} className={buttonClass("outline", "sm")} aria-label="Próximo mês"><ChevronRight className="size-4" /></Link>
          {!today.startsWith(month) && <Link href="/reservas" className={buttonClass("ghost", "sm")}>Hoje</Link>}
        </div>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {areas.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setFilter(filter === a.id ? null : a.id)}
              className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition", colorOf(a.id).chip, filter && filter !== a.id && "opacity-40")}
              aria-pressed={filter === a.id}
            >
              <span className={cx("size-2 rounded-full", colorOf(a.id).dot)} />{a.name}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {WEEK.map((w) => <p key={w} className="pb-1 text-center text-[11px] font-medium text-muted">{w}</p>)}
          {days.map((d) => {
            const list = byDay.get(d) ?? [];
            const out = !d.startsWith(month);
            return (
              <button
                key={d}
                type="button"
                onClick={() => setSelected(d)}
                className={cx(
                  "flex min-h-14 flex-col gap-0.5 rounded-lg border p-1 text-left transition sm:min-h-20",
                  selected === d ? "border-brand ring-1 ring-brand" : "border-line hover:border-line-strong",
                  out ? "bg-bg-2/50 opacity-50" : "bg-surface",
                )}
              >
                <span className={cx("text-[11px]", d === today ? "flex size-5 items-center justify-center rounded-full bg-brand font-semibold text-brand-ink" : "text-fg-2")}>{Number(d.slice(8))}</span>
                {/* Celular: pontinhos; computador: horário e área */}
                <span className="flex flex-wrap gap-0.5 sm:hidden">
                  {list.slice(0, 4).map((e, i) => <span key={i} className={cx("size-1.5 rounded-full", colorOf(e.areaId).dot, e.status === "pending" && "opacity-50")} />)}
                </span>
                <span className="hidden flex-col gap-0.5 sm:flex">
                  {list.slice(0, 3).map((e, i) => (
                    <span key={i} className={cx("truncate rounded px-1 text-[10px] font-medium leading-4", colorOf(e.areaId).chip, e.status === "pending" && "outline-1 outline-dashed outline-current -outline-offset-1")}>
                      {brtParts(new Date(e.startAt)).hm} {areas.find((a) => a.id === e.areaId)?.name.split(" ")[0]}
                    </span>
                  ))}
                  {list.length > 3 && <span className="text-[10px] text-muted">+{list.length - 3}</span>}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted">Contorno tracejado = aguardando aprovação. Toque num dia para ver os horários.</p>
      </div>

      <div className="min-w-0 rounded-2xl border border-line bg-surface p-4 lg:sticky lg:top-[calc(4rem+var(--chrome,0rem)+0.75rem)] lg:self-start">
        <p className="font-display text-base font-semibold first-letter:uppercase">{selLabel}</p>
        <p className="mb-3 text-xs text-muted">Horários de cada área</p>
        <div className="space-y-4">
          {areas.filter((a) => !filter || a.id === filter).map((a) => {
            const list = dayEvents.filter((e) => e.areaId === a.id);
            const c = colorOf(a.id);
            return (
              <div key={a.id}>
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-fg-2">
                  <span className={cx("size-2 rounded-full", c.dot)} />{a.name}
                  <span className="font-normal text-muted">{a.openTime && a.closeTime ? `· ${a.openTime}–${a.closeTime}` : "· qualquer horário"}</span>
                </p>
                <div className="space-y-1">
                  {list.map((e, i) => {
                    const st = BOOKING_STATUS[e.status as BookingStatus] ?? BOOKING_STATUS.pending;
                    const body = (
                      <>
                        <Lock className="size-3.5 shrink-0" />
                        <span className="font-medium">{brtParts(new Date(e.startAt)).hm}–{brtParts(new Date(e.endAt)).hm}</span>
                        <span className="min-w-0 flex-1 truncate">{e.label}{e.mine && " (sua)"}</span>
                        {e.status === "pending" && <span className="text-[11px]">{st.label.split(" ")[0]}</span>}
                      </>
                    );
                    return e.id ? (
                      <Link key={i} href={`/reservas/${e.id}`} className={cx("flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition hover:brightness-95", c.chip, e.status === "pending" && "outline-1 outline-dashed outline-current -outline-offset-1")}>{body}</Link>
                    ) : (
                      <div key={i} className={cx("flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs", c.chip, e.status === "pending" && "outline-1 outline-dashed outline-current -outline-offset-1")}>{body}</div>
                    );
                  })}
                  {canBook && selected >= today && (
                    <Link href={`/reservas/nova?area=${a.id}&dia=${selected}`} className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-line px-2.5 py-1.5 text-xs font-medium text-fg-2 transition hover:border-brand hover:text-brand">
                      <Plus className="size-3.5" />{list.length ? "Reservar outro horário" : "Reservar"}
                    </Link>
                  )}
                  {!list.length && !(canBook && selected >= today) && <p className="text-xs text-muted">Livre.</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
