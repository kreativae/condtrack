// Encomendas na portaria: regras puras (servidor e navegador).
import { brtParts } from "./booking";

export const PARCEL_STATUS = {
  waiting: { label: "Aguardando retirada", tone: "warn" },
  delivered: { label: "Entregue", tone: "ok" },
  returned: { label: "Devolvida", tone: "muted" },
} as const;
export type ParcelStatus = keyof typeof PARCEL_STATUS;

/** Sugestões de transportadora quando o condomínio não editou a lista (o campo aceita qualquer texto). */
export const CARRIERS = ["Correios", "Mercado Livre", "Amazon", "Shopee", "Magalu", "iFood", "Loggi", "Jadlog", "Total Express", "DHL", "FedEx"] as const;

/** Até quantos itens cada lista editável (transportadoras, locais) guarda. */
export const PARCEL_LIST_MAX = 40;

const foldKey = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Texto da Estrutura (um item por linha) → lista limpa: sem vazios, sem repetir (ignora maiúsculas e acentos). */
export function parseParcelList(text: string) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const item = normalizeLocation(line);
    if (!item || seen.has(foldKey(item))) continue;
    seen.add(foldKey(item));
    out.push(item);
  }
  return out.slice(0, PARCEL_LIST_MAX);
}

/** Transportadoras do recebimento: as do condomínio ou, sem lista própria, as padrão. */
export const parcelCarriers = (saved: string[]) => (saved.length ? saved : [...CARRIERS]);

/** Locais de guarda: os definidos na Estrutura ou, sem lista própria, os já usados. */
export const parcelLocations = (saved: string[], used: (string | null)[]) => (saved.length ? saved : locationSuggestions(used));

/** Depois de quantos dias parada na portaria a encomenda aparece em destaque. */
export const PARCEL_OVERDUE_DAYS = 7;

/** Dias de calendário (Brasília) desde o recebimento: recebida hoje = 0. */
export function parcelWaitDays(receivedAt: Date, now = new Date()) {
  const a = Date.parse(`${brtParts(receivedAt).day}T12:00:00Z`);
  const b = Date.parse(`${brtParts(now).day}T12:00:00Z`);
  return Math.max(0, Math.round((b - a) / 86400_000));
}

export const parcelOverdue = (receivedAt: Date, now = new Date()) => parcelWaitDays(receivedAt, now) >= PARCEL_OVERDUE_DAYS;

export function waitLabel(receivedAt: Date, now = new Date()) {
  const d = parcelWaitDays(receivedAt, now);
  return d === 0 ? "hoje" : d === 1 ? "ontem" : `há ${d} dias`;
}

/** "Armário 3" e "armario  3" viram o mesmo local nas sugestões. */
export const normalizeLocation = (s: string | null | undefined) => (s ?? "").trim().replace(/\s+/g, " ").slice(0, 60) || null;

/** Locais já usados, do mais usado para o menos usado, sem repetir (ignora maiúsculas e acentos). */
export function locationSuggestions(used: (string | null)[], limit = 20) {
  const key = foldKey;
  const count = new Map<string, { label: string; n: number }>();
  for (const raw of used) {
    const l = normalizeLocation(raw);
    if (!l) continue;
    const k = key(l);
    const cur = count.get(k);
    count.set(k, { label: cur?.label ?? l, n: (cur?.n ?? 0) + 1 });
  }
  return [...count.values()].sort((a, b) => b.n - a.n || a.label.localeCompare(b.label)).slice(0, limit).map((x) => x.label);
}
