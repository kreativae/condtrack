// Reservas de áreas comuns, pessoas da unidade e portaria: regras puras (servidor e navegador).
import type { Role } from "./roles";

export const BOOKING_STATUS = {
  pending: { label: "Aguardando aprovação", tone: "warn" },
  approved: { label: "Aprovada", tone: "ok" },
  rejected: { label: "Recusada", tone: "bad" },
  cancelled: { label: "Cancelada", tone: "muted" },
} as const;
export type BookingStatus = keyof typeof BOOKING_STATUS;

/** Quem aprova e recusa reservas, vê todas e cuida da portaria. */
export const GATE_ROLES: Role[] = ["superadmin", "syndic", "caretaker", "doorman"];
export const isGate = (role: Role) => GATE_ROLES.includes(role);

export const PERSON_KINDS = {
  resident: { label: "Morador", plural: "Moradores" },
  visitor: { label: "Visitante", plural: "Visitantes" },
  provider: { label: "Prestador de serviço", plural: "Prestadores de serviço" },
  delivery: { label: "Entrega", plural: "Entregas" },
} as const;
export type PersonKind = keyof typeof PERSON_KINDS;
export const isPersonKind = (v: unknown): v is PersonKind => typeof v === "string" && v in PERSON_KINDS;

export const MAX_GUESTS = 300;
export const MAX_BOOKING_HOURS = 24;
/** Quanto tempo à frente dá para reservar. */
export const MAX_ADVANCE_DAYS = 180;

const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
export const isHM = (v: unknown): v is string => typeof v === "string" && HM.test(v);
const DAY = /^\d{4}-\d{2}-\d{2}$/;
export const isDay = (v: unknown): v is string => typeof v === "string" && DAY.test(v) && !Number.isNaN(new Date(`${v}T12:00:00-03:00`).getTime());

/** Dia + hora de Brasília → Date. "24:00" não existe: o fim no dia seguinte vem de `endsNextDay`. */
export const brt = (day: string, hm: string) => new Date(`${day}T${hm}:00-03:00`);

/** Dia (AAAA-MM-DD) e hora (HH:MM) de uma data no fuso de Brasília. */
export function brtParts(d: Date) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const get = (t: string) => f.find((p) => p.type === t)?.value ?? "";
  return { day: `${get("year")}-${get("month")}-${get("day")}`, hm: `${get("hour")}:${get("minute")}` };
}

/**
 * Período da reserva a partir do formulário. Se a hora final for menor ou igual à inicial, termina no dia seguinte
 * (ex.: festa das 20:00 às 02:00).
 */
export function bookingRange(day: string, start: string, end: string) {
  const startAt = brt(day, start);
  const endAt = brt(day, end);
  if (endAt <= startAt) endAt.setUTCDate(endAt.getUTCDate() + 1);
  return { startAt, endAt };
}

const minutes = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3));

/**
 * Cabe no horário da área? Sem horário definido, qualquer horário vale.
 * Horário que vira a noite (ex.: 18:00–02:00) também é aceito.
 */
export function fitsOpening(start: string, end: string, open?: string | null, close?: string | null) {
  if (!isHM(open) || !isHM(close)) return true;
  const o = minutes(open);
  let c = minutes(close);
  if (c <= o) c += 24 * 60;
  let s = minutes(start);
  let e = minutes(end);
  if (e <= s) e += 24 * 60;
  // Começo antes da abertura pode ser madrugada de um horário que vira a noite
  if (s < o) {
    s += 24 * 60;
    e += 24 * 60;
  }
  return s >= o && e <= c;
}

/** Dois períodos se sobrepõem (encostar não conta: 14–18 e 18–22 podem). */
export const overlaps = (a: { startAt: Date; endAt: Date }, b: { startAt: Date; endAt: Date }) => a.startAt < b.endAt && b.startAt < a.endAt;

/** Reservas que ainda ocupam o horário (as recusadas e canceladas liberam). */
export const HOLDING: BookingStatus[] = ["pending", "approved"];

/** Lista de convidados digitada: um por linha, documento opcional depois de ";" ou "|". Remove repetidos. */
export function parseGuests(text: string) {
  const seen = new Set<string>();
  const out: { name: string; document: string | null }[] = [];
  for (const line of text.split("\n")) {
    const [rawName, rawDoc] = line.split(/\s*[;|]\s*/);
    const name = (rawName ?? "").replace(/^\s*(\d+[.)-]|[-•*])\s*/, "").trim().replace(/\s+/g, " ").slice(0, 120);
    if (name.length < 2) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, document: rawDoc?.trim().slice(0, 40) || null });
  }
  return out;
}

export const guestsToText = (g: { name: string; document: string | null }[]) => g.map((x) => (x.document ? `${x.name}; ${x.document}` : x.name)).join("\n");

// ───── Pessoas e autorizações da portaria

/** Documento só com letras e números, em maiúsculas: "123.456.789-00" e "12345678900" são a mesma pessoa. */
export const docKey = (doc: string | null | undefined) => (doc ?? "").replace(/[^0-9a-z]/gi, "").toUpperCase() || null;

export const WEEKDAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;
const WEEKDAY_PLURAL = ["Domingos", "Segundas", "Terças", "Quartas", "Quintas", "Sextas", "Sábados"] as const;
export const parseWeekdays = (s: string) => [...new Set(s.split(",").filter(Boolean).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort();

type GrantLike = { kind: string; validFrom: Date | null; validUntil: Date | null; weekdays: string; timeFrom: string | null; timeTo: string | null };

/** "Terças e sextas · 08:00–17:00 · até 31/12/2026" */
export function grantSchedule(g: GrantLike) {
  const days = parseWeekdays(g.weekdays);
  const dd = (d: Date) => brtParts(d).day.split("-").reverse().join("/");
  const parts = [
    days.length && days.length < 7 ? (days.length === 1 ? WEEKDAY_PLURAL[days[0]] : days.length <= 3 ? days.map((d) => WEEKDAY_PLURAL[d]).join(", ").replace(/, ([^,]*)$/, " e $1") : days.map((d) => WEEKDAY_SHORT[d]).join(", ")) : null,
    isHM(g.timeFrom) && isHM(g.timeTo) ? `${g.timeFrom}–${g.timeTo}` : null,
    g.validFrom && g.validUntil && brtParts(g.validFrom).day === brtParts(g.validUntil).day ? `só em ${dd(g.validFrom)}` : [g.validFrom && `a partir de ${dd(g.validFrom)}`, g.validUntil && `até ${dd(g.validUntil)}`].filter(Boolean).join(" ") || null,
  ].filter(Boolean);
  return parts.join(" · ") || (g.kind === "resident" ? "Mora na unidade" : "Sempre liberado");
}

/**
 * Situação da autorização num momento: `today` = vale hoje (dia da semana e prazo); `off_day` = dentro do prazo,
 * mas não neste dia; `future` = ainda não começou; `expired` = venceu. Prazos valem o dia inteiro (Brasília).
 */
export function grantStatus(g: GrantLike, now = new Date()): "today" | "off_day" | "future" | "expired" {
  const today = brtParts(now).day;
  if (g.validUntil && brtParts(g.validUntil).day < today) return "expired";
  if (g.validFrom && brtParts(g.validFrom).day > today) return "future";
  const days = parseWeekdays(g.weekdays);
  if (days.length && !days.includes(new Date(`${today}T12:00:00Z`).getUTCDay())) return "off_day";
  return "today";
}

export const GRANT_STATUS = {
  today: { label: "Vale hoje", tone: "ok" },
  off_day: { label: "Fora do dia", tone: "muted" },
  future: { label: "Ainda não começou", tone: "info" },
  expired: { label: "Vencida", tone: "muted" },
} as const;

/**
 * Esperado hoje na portaria: autorização de quem vem de fora que vale hoje e que tem algo de "agendado"
 * (dia da semana, data de início/fim próxima) ou foi criada nas últimas 24 h. "Sempre liberado" não entra.
 */
export function expectedToday(g: GrantLike & { createdAt: Date }, now = new Date()) {
  if (g.kind === "resident" || grantStatus(g, now) !== "today") return false;
  if (parseWeekdays(g.weekdays).length) return true;
  if (g.validFrom || (g.validUntil && g.validUntil.getTime() - now.getTime() < 7 * 86400_000)) return true;
  return now.getTime() - g.createdAt.getTime() < 86400_000;
}

/** Morador e conselheiro que moram na unidade podem reservar e cadastrar pessoas dela. */
export const LIVES_IN_UNIT: Role[] = ["resident", "council", "syndic"];

/** "ter., 20 de out. · 20:00–02:00" no fuso de Brasília. */
export function fmtPeriod(startAt: Date | string, endAt: Date | string) {
  const s = new Date(startAt);
  const e = new Date(endAt);
  const day = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "2-digit", month: "short" }).format(s);
  const a = brtParts(s);
  const b = brtParts(e);
  return `${day} · ${a.hm}–${b.hm}${b.day !== a.day ? " (dia seguinte)" : ""}`;
}

/** Cor de cada área no calendário (cores do tema, na ordem das áreas). */
export const AREA_COLORS = [
  { chip: "bg-brand/10 text-brand", dot: "bg-brand" },
  { chip: "bg-info/10 text-info", dot: "bg-info" },
  { chip: "bg-ok/10 text-ok", dot: "bg-ok" },
  { chip: "bg-warn/10 text-warn", dot: "bg-warn" },
  { chip: "bg-bad/10 text-bad", dot: "bg-bad" },
] as const;
export const areaColor = (i: number) => AREA_COLORS[i % AREA_COLORS.length];

/** "2026-10" válido? */
export const isMonth = (v: unknown): v is string => typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);

/** Dias (AAAA-MM-DD) da grade do mês, de domingo a sábado, incluindo as pontas dos meses vizinhos. */
export function monthGrid(month: string) {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1, 12));
  const start = new Date(first);
  start.setUTCDate(1 - first.getUTCDay());
  const last = new Date(Date.UTC(y, m, 0, 12));
  const end = new Date(last);
  end.setUTCDate(last.getUTCDate() + (6 - last.getUTCDay()));
  const days: string[] = [];
  for (const d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) days.push(d.toISOString().slice(0, 10));
  return days;
}

export function shiftMonthKey(month: string, n: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}
