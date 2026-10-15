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

/** A pessoa cadastrada ainda vale? Morador não vence; visitante e prestador vencem no fim do dia de `validUntil`. */
export function personValid(p: { kind: string; validUntil: Date | null }, now = new Date()) {
  if (p.kind === "resident" || !p.validUntil) return true;
  return now.getTime() < p.validUntil.getTime() + 24 * 3600_000;
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
