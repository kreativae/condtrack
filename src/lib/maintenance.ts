// Manutenção preventiva: periodicidade, situação e sugestões. Seguro para client e server.

export const PLAN_KINDS = {
  service: { label: "Serviço recorrente", hint: "Abre a ordem de serviço sozinho, antes da data, e agenda a próxima." },
  document: { label: "Documento ou laudo", hint: "AVCB, seguro, laudos: avisa antes de vencer e no vencimento." },
} as const;
export type PlanKind = keyof typeof PLAN_KINDS;

export const PLAN_UNITS = { week: ["semana", "semanas"], month: ["mês", "meses"], year: ["ano", "anos"] } as const;
export type PlanUnit = keyof typeof PLAN_UNITS;

export const isPlanKind = (k: string): k is PlanKind => k in PLAN_KINDS;
export const isPlanUnit = (u: string): u is PlanUnit => u in PLAN_UNITS;

/** "Todo mês", "A cada 6 meses", "Todo ano"… */
export function everyLabel(every: number, unit: string) {
  const u = isPlanUnit(unit) ? unit : "month";
  if (every === 1) return u === "week" ? "Toda semana" : u === "month" ? "Todo mês" : "Todo ano";
  return `A cada ${every} ${PLAN_UNITS[u][1]}`;
}

/** Duração aproximada de um ciclo em dias (para limitar a antecedência). */
export const periodDays = (every: number, unit: string) => every * (unit === "week" ? 7 : unit === "year" ? 365 : 30);

/** Próxima data do ciclo (fim de mês ajustado: 31/01 + 1 mês = 28 ou 29/02). */
export function advance(date: string, every: number, unit: string) {
  const [y, m, d] = date.split("-").map(Number);
  if (unit === "week") {
    const t = new Date(Date.UTC(y, m - 1, d + 7 * every));
    return t.toISOString().slice(0, 10);
  }
  const months = unit === "year" ? 12 * every : every;
  const first = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(d, last));
  return first.toISOString().slice(0, 10);
}

/** Dias de `from` até `to` (YYYY-MM-DD). Negativo = já passou. */
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);

export type PlanStatus = { tone: "ok" | "warn" | "bad" | "muted"; label: string };

/** Situação de um plano hoje. */
export function planStatus(p: { kind: string; nextDue: string; leadDays: number; active: boolean }, today: string): PlanStatus {
  if (!p.active) return { tone: "muted", label: "Pausado" };
  const days = daysBetween(today, p.nextDue);
  if (p.kind === "document") {
    if (days < 0) return { tone: "bad", label: `Vencido há ${-days} ${-days === 1 ? "dia" : "dias"}` };
    if (days === 0) return { tone: "bad", label: "Vence hoje" };
    if (days <= p.leadDays) return { tone: "warn", label: `Vence em ${days} ${days === 1 ? "dia" : "dias"}` };
    return { tone: "ok", label: "Em dia" };
  }
  if (days <= p.leadDays) return { tone: "warn", label: days <= 0 ? "OS a abrir" : `OS abre em breve` };
  return { tone: "ok", label: `Próxima em ${days} dias` };
}

export const fmtDay = (date: string) => {
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
};

/** Sugestões para começar (o síndico ajusta datas, prestador e antecedência depois). */
export const PLAN_SUGGESTIONS: { kind: PlanKind; title: string; description: string; every: number; unit: PlanUnit; leadDays: number; category?: string }[] = [
  { kind: "service", title: "Limpeza da caixa d’água", description: "Limpeza e desinfecção dos reservatórios, com certificado.", every: 6, unit: "month", leadDays: 15, category: "Hidráulica" },
  { kind: "service", title: "Dedetização e desratização", description: "Controle de pragas nas áreas comuns, com certificado.", every: 6, unit: "month", leadDays: 15, category: "Limpeza" },
  { kind: "service", title: "Recarga e inspeção dos extintores", description: "Recarga, teste e etiqueta de validade de todos os extintores.", every: 1, unit: "year", leadDays: 30 },
  { kind: "service", title: "Manutenção dos elevadores", description: "Visita mensal da empresa conservadora (contrato).", every: 1, unit: "month", leadDays: 5, category: "Elevadores" },
  { kind: "service", title: "Limpeza das calhas e ralos", description: "Desobstrução de calhas, condutores e ralos antes das chuvas.", every: 6, unit: "month", leadDays: 10, category: "Limpeza" },
  { kind: "service", title: "Revisão do gerador e bombas", description: "Teste de carga do gerador e revisão das bombas de recalque.", every: 3, unit: "month", leadDays: 7, category: "Elétrica" },
  { kind: "document", title: "AVCB (Auto de Vistoria do Corpo de Bombeiros)", description: "Renovar com antecedência: exige vistoria.", every: 3, unit: "year", leadDays: 90 },
  { kind: "document", title: "Seguro predial obrigatório", description: "Apólice contra incêndio e danos à estrutura.", every: 1, unit: "year", leadDays: 30 },
  { kind: "document", title: "Laudo do SPDA (para-raios)", description: "Inspeção e medição do sistema de proteção contra descargas.", every: 1, unit: "year", leadDays: 30 },
  { kind: "document", title: "Laudo de inspeção predial", description: "Conforme a legislação do município.", every: 5, unit: "year", leadDays: 90 },
];
