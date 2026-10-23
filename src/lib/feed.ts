// Feed de serviços: textos do resumo de cada serviço entregue (seguro para client e server, testado em __tests__/feed.test.ts).

const DAY = 86_400_000;
/** Dia "AAAA-MM-DD" de Brasília */
const brDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);

/** Da abertura à entrega, em dias do calendário de Brasília: "no mesmo dia", "em 1 dia", "em 12 dias". */
export function resolvedIn(openedAt: Date, doneAt: Date | null) {
  if (!doneAt) return null;
  const days = Math.round((Date.parse(`${brDay(doneAt)}T12:00:00Z`) - Date.parse(`${brDay(openedAt)}T12:00:00Z`)) / DAY);
  if (days <= 0) return "no mesmo dia";
  return days === 1 ? "em 1 dia" : `em ${days} dias`;
}

/** Horas de trabalho: "45 min", "2 h", "2h30" */
export function workTime(minutes: number | null | undefined) {
  if (!minutes || minutes <= 0) return null;
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h} h`;
}

/** Média de dias entre abertura e entrega (null sem dados) */
export function averageDays(items: { createdAt: Date; approvedAt: Date | null }[]) {
  const done = items.filter((o) => o.approvedAt);
  if (!done.length) return null;
  const sum = done.reduce((n, o) => n + (o.approvedAt!.getTime() - o.createdAt.getTime()), 0);
  return Math.round((sum / done.length / DAY) * 10) / 10;
}

/** Nota média de 1 a 5 com uma casa (null sem avaliações) */
export function averageRating(items: { rating: number | null }[]) {
  const rated = items.filter((o) => o.rating);
  return rated.length ? Math.round((rated.reduce((n, o) => n + o.rating!, 0) / rated.length) * 10) / 10 : null;
}

/** Chave e nome do mês de Brasília para agrupar: "2026-10" → "outubro de 2026" */
export function monthOf(d: Date) {
  const key = brDay(d).slice(0, 7);
  const label = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", month: "long", year: "numeric" }).format(d);
  return { key, label: label.charAt(0).toUpperCase() + label.slice(1) };
}

export const FEED_PERIODS = { "30d": "Últimos 30 dias", ano: "Este ano", tudo: "Tudo" } as const;
export type FeedPeriod = keyof typeof FEED_PERIODS;

/** Início do período (null = tudo). `now` em ms. */
export function periodStart(period: FeedPeriod, now: number) {
  if (period === "30d") return new Date(now - 30 * DAY);
  if (period === "ano") return new Date(`${brDay(new Date(now)).slice(0, 4)}-01-01T00:00:00-03:00`);
  return null;
}
