// Vocabulário da estrutura do condomínio: prédios (torres × andares × apartamentos)
// ou horizontal (quadras/ruas × casas ou lotes). Tudo o que exibe uma unidade
// passa por aqui para falar a língua certa de cada condomínio.

export const LAYOUTS = {
  vertical: { label: "Vertical", hint: "Prédios: torres ou blocos com apartamentos por andar." },
  horizontal: { label: "Horizontal", hint: "Casas ou lotes, organizados ou não em quadras/ruas." },
  mixed: { label: "Misto", hint: "Torres e quadras no mesmo condomínio." },
} as const;
export type Layout = keyof typeof LAYOUTS;
export const isLayout = (v: unknown): v is Layout => typeof v === "string" && v in LAYOUTS;

export const HOUSE_NOUNS = { house: { one: "Casa", many: "Casas" }, lot: { one: "Lote", many: "Lotes" } } as const;
export type HouseNoun = keyof typeof HOUSE_NOUNS;
export const isHouseNoun = (v: unknown): v is HouseNoun => typeof v === "string" && v in HOUSE_NOUNS;

export const GROUP_KINDS = {
  tower: { one: "Torre/bloco", many: "Torres e blocos" },
  block: { one: "Quadra/rua", many: "Quadras e ruas" },
} as const;
export type GroupKind = keyof typeof GROUP_KINDS;

export const UNIT_TYPES = {
  apartment: { one: "Apartamento", short: "Apto" },
  house: { one: "Casa", short: "Casa" },
  lot: { one: "Lote", short: "Lote" },
  commercial: { one: "Sala comercial", short: "Sala" },
  other: { one: "Outro", short: "Outro" },
} as const;
export type UnitType = keyof typeof UNIT_TYPES;
export const UNIT_TYPE_KEYS = Object.keys(UNIT_TYPES) as [UnitType, ...UnitType[]];

/** Tipo de agrupamento criado por padrão em cada layout. */
export const defaultKind = (layout: string): GroupKind => (layout === "horizontal" ? "block" : "tower");

type GroupLike = { name: string; kind?: string | null; implicit?: boolean | null };
type UnitLike = { number: string; type?: string | null; building: GroupLike };

/** "Casa", "Lote" ou "Unidade", conforme o agrupamento e o tipo da unidade. */
export function unitNoun(u: { type?: string | null; building: { kind?: string | null } }) {
  if (u.type === "lot") return "Lote";
  if (u.type === "house" || u.building.kind === "block") return "Casa";
  return "Unidade";
}

/**
 * Rótulo completo da unidade: "Torre A · Unidade 301", "Quadra B · Casa 12" ou só
 * "Lote 15" (condomínio horizontal sem quadras). `compact` encurta o de prédio
 * para "Torre A · 301" (listas e selects).
 */
export function unitLabel(u: UnitLike, compact = false) {
  const noun = unitNoun(u);
  if (u.building.implicit) return `${noun} ${u.number}`;
  if (noun === "Unidade" && compact) return `${u.building.name} · ${u.number}`;
  return `${u.building.name} · ${noun} ${u.number}`;
}

/** Nomes usados na tela de estrutura, de acordo com o layout do condomínio. */
export function structureWords(layout: string, houseNoun: string) {
  const house = HOUSE_NOUNS[isHouseNoun(houseNoun) ? houseNoun : "house"];
  if (layout === "horizontal") return { groups: "Quadras e ruas", group: "quadra/rua", units: house.many.toLowerCase(), tab: `Quadras e ${house.many.toLowerCase()}` };
  if (layout === "mixed") return { groups: "Torres e quadras", group: "torre/quadra", units: "unidades", tab: "Torres, quadras e unidades" };
  return { groups: "Torres e blocos", group: "torre/bloco", units: "unidades", tab: "Torres e unidades" };
}

/** Numeração de apartamento: andar + posição (1º andar, 2ª unidade → "102"). */
export const aptNumber = (floor: number, i: number) => `${floor}${String(i).padStart(2, "0")}`;

/** Numeração de casas/lotes: faixa com prefixo opcional e zeros à esquerda ("L-01"…"L-40"). */
export function houseNumbers(from: number, to: number, prefix = "", pad = false) {
  const width = pad ? String(to).length : 0;
  return Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => `${prefix}${String(from + i).padStart(width, "0")}`);
}

const natural = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });
/** Ordena por agrupamento e número em ordem natural (B-2 antes de B-10). */
export const byUnit = (a: UnitLike, b: UnitLike) => natural.compare(a.building.name, b.building.name) || natural.compare(a.number, b.number);
/** Só o número, em ordem natural (dentro de um mesmo agrupamento). */
export const byNumber = (a: { number: string }, b: { number: string }) => natural.compare(a.number, b.number);
