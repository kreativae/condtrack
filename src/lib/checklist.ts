// Checklist do zelador: frequências e datas (sempre no fuso de Brasília,
// para "hoje" ser o mesmo dia para todos, independente do servidor).

export const TZ = "America/Sao_Paulo";
export const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;
export const FREQUENCIES = { daily: "Todos os dias", weekdays: "Dias da semana", weekly: "Uma vez por semana" } as const;
export type Frequency = keyof typeof FREQUENCIES;

/** Data (YYYY-MM-DD), dia da semana (0 = domingo) e minutos do dia em Brasília. */
export function spNow(ms: number) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short" })
      .formatToParts(new Date(ms))
      .map((p) => [p.type, p.value]),
  );
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  return { date, dow: dowOf(date), minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

/** Dia da semana de uma data YYYY-MM-DD (independe de fuso). */
export const dowOf = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

export const parseDays = (s: string) => s.split(",").filter(Boolean).map(Number).filter((n) => n >= 0 && n <= 6);

/** O item precisa ser conferido nesta data? */
export function isDue(item: { frequency: string; weekdays: string }, date: string) {
  if (item.frequency === "daily") return true;
  return parseDays(item.weekdays).includes(dowOf(date));
}

export function frequencyLabel(item: { frequency: string; weekdays: string }) {
  if (item.frequency === "daily") return "Todos os dias";
  const days = parseDays(item.weekdays).map((d) => WEEKDAYS[d]);
  if (!days.length) return "Sem dia definido";
  return item.frequency === "weekly" ? `Toda ${days[0].toLowerCase()}.` : days.join(", ");
}

/** Soma dias a uma data YYYY-MM-DD. */
export function addDays(date: string, n: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const fmtDay = (date: string) =>
  new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));

/** "HH:MM" → minutos (ou null). */
export function deadlineMinutes(v: string | null | undefined) {
  const m = v?.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export const DEFAULT_CHECKLIST = [
  "Iluminação das áreas comuns",
  "Portões e interfones",
  "Bombas d’água e reservatórios",
  "Limpeza do hall e elevadores",
  "Piscina — cloro e pH",
  "Extintores e rotas de fuga",
  "Garagem — vazamentos e lâmpadas",
];
