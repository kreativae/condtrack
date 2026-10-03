// Assembleias: rótulos, situação e apuração. Seguro para client e server.

export const ASSEMBLY_KINDS = { ordinary: "Assembleia geral ordinária", extraordinary: "Assembleia geral extraordinária" } as const;
export type AssemblyKind = keyof typeof ASSEMBLY_KINDS;

export const ASSEMBLY_STATUS = {
  draft: { label: "Rascunho", tone: "muted" },
  open: { label: "Votação aberta", tone: "ok" },
  closed: { label: "Encerrada", tone: "info" },
} as const;
export type AssemblyStatus = keyof typeof ASSEMBLY_STATUS;

export const DEFAULT_OPTIONS = ["A favor", "Contra", "Abstenção"];

/** Opções de um item (JSON salvo no banco), com o padrão se vier vazio ou inválido. */
export function parseOptions(json: string): string[] {
  try {
    const v = JSON.parse(json);
    if (Array.isArray(v) && v.length >= 2 && v.every((x) => typeof x === "string")) return v;
  } catch {}
  return DEFAULT_OPTIONS;
}

/** "Sim\nNão\n" → ["Sim", "Não"] (2 a 10 opções, sem repetidas); vazio = padrão. */
export function optionsFromText(text: string): string[] | null {
  const list = [...new Set(text.split("\n").map((s) => s.trim()).filter(Boolean))].map((s) => s.slice(0, 60));
  if (!list.length) return DEFAULT_OPTIONS;
  return list.length >= 2 && list.length <= 10 ? list : null;
}

export type Tally = { counts: number[]; total: number; winner: number | null };

/** Apuração de um item: votos por opção e a mais votada (null em empate ou sem votos). Abstenção não vence. */
export function tally(options: string[], votes: { option: number }[]): Tally {
  const counts = options.map((_, i) => votes.filter((v) => v.option === i).length);
  const total = counts.reduce((a, b) => a + b, 0);
  const ranked = counts.map((c, i) => ({ c, i })).filter((x) => !/^absten/i.test(options[x.i])).sort((a, b) => b.c - a.c);
  const winner = ranked.length && ranked[0].c > 0 && (ranked.length === 1 || ranked[0].c > ranked[1].c) ? ranked[0].i : null;
  return { counts, total, winner };
}

export const pct = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0);

const dt = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const dLong = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "numeric", month: "long", year: "numeric" });
const hm = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

/** "12/10/2026 19:30" no fuso de Brasília. */
export const fmtDateTimeBR = (d: Date | string) => dt.format(new Date(d)).replace(",", "");
/** "segunda-feira, 12 de outubro de 2026, às 19:30". */
export const fmtMeeting = (d: Date | string) => `${dLong.format(new Date(d))}, às ${hm.format(new Date(d))}`;

/** Valor para <input type="datetime-local"> no fuso de Brasília. */
export function toLocalInput(d: Date | string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(d))
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
/** "2026-10-12T19:30" (Brasília) → Date. */
export const fromLocalInput = (v: string) => (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v) ? new Date(`${v}:00-03:00`) : null);
