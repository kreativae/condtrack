// Fornecedores e orçamentos: regras puras (seguro para client e server, testado em __tests__/suppliers.test.ts).
import type { Role } from "./roles";
import type { Tone } from "@/components/ui";

/** Quem usa a página: o zelador cadastra; síndico e superadmin também decidem */
export const SUPPLIER_ROLES = ["superadmin", "syndic", "caretaker"] as const satisfies readonly Role[];
export const canDecideQuote = (role: Role) => role === "superadmin" || role === "syndic";

export const QUOTE_STATUS = {
  pending: { label: "Aguardando o síndico", short: "Aguardando", tone: "warn" },
  approved: { label: "Aprovado", short: "Aprovado", tone: "ok" },
  rejected: { label: "Recusado", short: "Recusado", tone: "bad" },
  cancelled: { label: "Cancelado", short: "Cancelado", tone: "muted" },
} as const satisfies Record<string, { label: string; short: string; tone: Tone }>;
export type QuoteStatus = keyof typeof QUOTE_STATUS;
export const quoteStatus = (s: string) => QUOTE_STATUS[s as QuoteStatus] ?? QUOTE_STATUS.pending;

/** Ramos sugeridos no cadastro (o campo aceita qualquer texto) */
export const SUPPLIER_CATEGORIES = [
  "Elétrica", "Hidráulica", "Pintura", "Jardinagem", "Limpeza", "Dedetização", "Elevadores", "Portões e automação",
  "Segurança e CFTV", "Piscina", "Serralheria", "Vidraçaria", "Marcenaria", "Ar-condicionado", "Gás", "Extintores e incêndio",
  "Impermeabilização", "Telhado e calhas", "Material de construção", "Material de limpeza", "Outros",
];

/** Arquivos do orçamento: PDF e fotos (tipo → extensão) */
export const QUOTE_FILE_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
export const MAX_QUOTE_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_QUOTE_FILES = 10;

/** Pode editar ou cancelar: só enquanto aguarda; quem cadastrou ou quem decide. */
export function canChangeQuote(q: { status: string; createdById: string | null }, user: { id: string; role: Role }) {
  return q.status === "pending" && (canDecideQuote(user.role) || q.createdById === user.id);
}

/** Validade vencida (o orçamento ainda aguardando, mas o preço pode não valer mais). `today` = "AAAA-MM-DD" de Brasília. */
export function quoteExpired(validUntilDay: string | null, today: string) {
  return !!validUntilDay && validUntilDay < today;
}

/** Chave para juntar orçamentos do mesmo serviço: sem acento, caixa ou espaços extras */
export function quoteKey(title: string) {
  return title.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

type Comparable = { id: string; title: string; amountCents: number; status: string };
/**
 * Orçamentos do mesmo serviço lado a lado (2 ou mais, sem os cancelados/recusados), do mais barato ao mais caro.
 * Só entram grupos com algum orçamento aguardando: o que já foi decidido não precisa mais de comparação.
 */
export function quoteGroups<T extends Comparable>(quotes: T[]) {
  const map = new Map<string, T[]>();
  for (const q of quotes) {
    if (q.status !== "pending" && q.status !== "approved") continue;
    const k = quoteKey(q.title);
    if (!k) continue;
    map.set(k, [...(map.get(k) ?? []), q]);
  }
  return [...map.values()]
    .filter((list) => list.length > 1 && list.some((q) => q.status === "pending"))
    .map((list) => {
      const sorted = [...list].sort((a, b) => a.amountCents - b.amountCents);
      return { title: sorted[0].title, quotes: sorted, cheapestId: sorted[0].id, spread: sorted[sorted.length - 1].amountCents - sorted[0].amountCents };
    });
}

/** Letra da agenda (A–Z sem acento; o resto vai para "#") */
export function supplierLetter(name: string) {
  const c = name.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().charAt(0).toUpperCase();
  return /[A-Z]/.test(c) ? c : "#";
}

/** Número para o link do WhatsApp: celular/fixo brasileiro ganha o 55; outro formato fica como está. */
export function whatsappNumber(phone: string | null | undefined) {
  const d = String(phone ?? "").replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) return `55${d}`;
  return d.length >= 12 ? d : null;
}

/** Nota de 1 a 5 (vazio, zero ou inválido = sem nota) */
export function parseRating(v: unknown) {
  const n = Math.round(Number(v));
  return n >= 1 && n <= 5 ? n : null;
}

/** Dias entre duas datas "AAAA-MM-DD" (b − a) */
function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}

/** Validade em palavras, com o tom do aviso: vencida (bad), vence em até 5 dias (warn), ou a data (muted). */
export function validityLabel(validUntilDay: string | null, today: string): { text: string; tone: "bad" | "warn" | "muted" } | null {
  if (!validUntilDay) return null;
  const d = daysBetween(today, validUntilDay);
  if (d < 0) return { text: d === -1 ? "validade venceu ontem" : `validade vencida há ${-d} dias`, tone: "bad" };
  if (d === 0) return { text: "vale até hoje", tone: "warn" };
  if (d <= 5) return { text: d === 1 ? "vale até amanhã" : `vale por mais ${d} dias`, tone: "warn" };
  return { text: `válido até ${validUntilDay.split("-").reverse().join("/")}`, tone: "muted" };
}

/** Quanto este valor está acima do menor (ex.: "+12%"); o menor (ou igual) não tem rótulo. */
export function priceDiff(cents: number, minCents: number) {
  if (cents <= minCents || minCents <= 0) return null;
  const pct = ((cents - minCents) / minCents) * 100;
  return `+${pct < 1 ? pct.toFixed(1).replace(".", ",") : Math.round(pct)}%`;
}
