// Parceiros e comissões: regras puras (seguro para client e server, testado em __tests__/commissions.test.ts).
import type { Tone } from "@/components/ui";

export const PARTNER_KINDS = {
  referrer: { label: "Indicador", hint: "Só passa o contato (síndico profissional, morador, conhecido)" },
  seller: { label: "Vendedor", hint: "Apresenta, faz a demonstração e acompanha até assinar" },
  agency: { label: "Administradora", hint: "Empresa que traz condomínios da própria carteira" },
} as const;
export type PartnerKind = keyof typeof PARTNER_KINDS;
export const isPartnerKind = (v: unknown): v is PartnerKind => typeof v === "string" && v in PARTNER_KINDS;
export const partnerKind = (k: string) => PARTNER_KINDS[k as PartnerKind] ?? PARTNER_KINDS.seller;

/** pct = % no começo; months = por quantos meses (0 = enquanto o condomínio pagar); afterPct = % depois desse prazo */
export type CommissionRule = { pct: number; months: number; afterPct: number };
/** Regras editáveis pelo superadmin (Setting commission_rules) */
export type CommissionSettings = {
  rules: Record<PartnerKind, CommissionRule>;
  /** Carência: a comissão só fica "a pagar" depois de N pagamentos do condomínio */
  holdPayments: number;
  /** % descontado do valor pago antes de calcular (impostos e taxas da plataforma) */
  deductPct: number;
};

export const COMMISSION_SETTINGS_KEY = "commission_rules";
export const DEFAULT_COMMISSION_SETTINGS: CommissionSettings = {
  rules: {
    referrer: { pct: 10, months: 12, afterPct: 0 },
    seller: { pct: 20, months: 12, afterPct: 5 },
    agency: { pct: 20, months: 0, afterPct: 0 },
  },
  holdPayments: 2,
  deductPct: 0,
};

const pctOk = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100 ? Math.round(v * 100) / 100 : fallback);
const intOk = (v: unknown, fallback: number, max: number) => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= max ? v : fallback);

/** Lê o Setting salvo; o que faltar ou estiver fora do lugar volta ao padrão. */
export function parseCommissionSettings(raw: string | null | undefined): CommissionSettings {
  let v: Partial<CommissionSettings> & { rules?: Partial<Record<string, Partial<CommissionRule>>> } = {};
  try {
    v = JSON.parse(raw ?? "{}");
  } catch {}
  const d = DEFAULT_COMMISSION_SETTINGS;
  const rules = Object.fromEntries(
    (Object.keys(PARTNER_KINDS) as PartnerKind[]).map((k) => {
      const r: Partial<CommissionRule> = v.rules?.[k] ?? {};
      return [k, { pct: pctOk(r.pct, d.rules[k].pct), months: intOk(r.months, d.rules[k].months, 120), afterPct: pctOk(r.afterPct, d.rules[k].afterPct) }];
    }),
  ) as Record<PartnerKind, CommissionRule>;
  return { rules, holdPayments: intOk(v.holdPayments, d.holdPayments, 12), deductPct: pctOk(v.deductPct, d.deductPct) };
}

/** Regra que vale para o parceiro: a própria (campos preenchidos) ou a do tipo dele. */
export function ruleFor(p: { kind: string; firstPct: number | null; firstMonths: number | null; afterPct: number | null }, s: CommissionSettings): CommissionRule & { custom: boolean } {
  const base = s.rules[isPartnerKind(p.kind) ? p.kind : "seller"];
  const custom = p.firstPct != null || p.firstMonths != null || p.afterPct != null;
  return { pct: p.firstPct ?? base.pct, months: p.firstMonths ?? base.months, afterPct: p.afterPct ?? base.afterPct, custom };
}

/** "20% por 12 meses e 5% depois" / "20% enquanto pagar" */
export function ruleLabel(r: CommissionRule) {
  const n = (x: number) => String(x).replace(".", ",");
  if (!r.months) return `${n(r.pct)}% enquanto o condomínio pagar`;
  return `${n(r.pct)}% por ${r.months} ${r.months === 1 ? "mês" : "meses"}${r.afterPct ? ` e ${n(r.afterPct)}% depois` : ""}`;
}

/** Meses completos entre duas datas (o dia do mês conta: 10/01 → 09/02 = 0; 10/01 → 10/02 = 1). */
export function monthsBetween(a: Date, b: Date) {
  const m = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  return b.getUTCDate() < a.getUTCDate() ? m - 1 : m;
}

/**
 * Comissão de um pagamento: o prazo conta do primeiro pagamento depois do vínculo com o parceiro.
 * null quando a % da fase é zero (nada a registrar).
 */
export function commissionFor(paidCents: number, paidAt: Date, firstPaidAt: Date, rule: CommissionRule, deductPct: number) {
  const first = !rule.months || monthsBetween(firstPaidAt, paidAt) < rule.months;
  const pct = first ? rule.pct : rule.afterPct;
  if (!pct || paidCents <= 0) return null;
  const baseCents = Math.round(paidCents * (1 - deductPct / 100));
  return { phase: first ? "first" : "after", pct, baseCents, amountCents: Math.round((baseCents * pct) / 100) };
}

/** Carência: com menos pagamentos que o mínimo, a comissão espera ("pending"); depois, fica "a pagar". */
export const releasedStatus = (paidCount: number, holdPayments: number) => (paidCount >= Math.max(1, holdPayments) ? "due" : "pending");

export const COMMISSION_STATUS = {
  pending: { label: "Em carência", tone: "muted" },
  due: { label: "A pagar", tone: "warn" },
  paid: { label: "Paga", tone: "ok" },
  cancelled: { label: "Cancelada", tone: "bad" },
} as const satisfies Record<string, { label: string; tone: Tone }>;
export const commissionStatus = (s: string) => COMMISSION_STATUS[s as keyof typeof COMMISSION_STATUS] ?? COMMISSION_STATUS.pending;

/** Código do parceiro: maiúsculas e números, sem acento, 4 a 16 caracteres. null se não servir. */
export function normalizeCode(v: string) {
  const c = v.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return c.length >= 4 && c.length <= 16 ? c : null;
}

/** Sugestão de código a partir do nome: primeiro nome + 2 dígitos (ex.: JOAO27). */
export function suggestCode(name: string, rand: () => number = Math.random) {
  const first = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z ]/g, "").trim().split(/\s+/)[0] || "PARCEIRO";
  return `${first.slice(0, 10).padEnd(4, "X")}${String(Math.floor(rand() * 90) + 10)}`;
}
