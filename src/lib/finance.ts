// Financeiro do condomínio: tipos, categorias, formatação e textos.
// Seguro para client e server.

export const FIN_TYPES = { income: "Receita", expense: "Despesa" } as const;
export type FinType = keyof typeof FIN_TYPES;

export const FIN_STATUS = {
  pending: { label: "Pendente", tone: "warn" },
  paid: { label: "Pago", tone: "ok" },
  cancelled: { label: "Cancelado", tone: "muted" },
} as const;
export type FinStatus = keyof typeof FIN_STATUS;

/** Sugestões de categoria (o campo aceita qualquer texto). */
export const FIN_CATEGORIES: Record<FinType, string[]> = {
  expense: [
    "Manutenção", "Limpeza", "Portaria e segurança", "Folha de pagamento", "Encargos e impostos", "Água", "Energia", "Gás",
    "Elevadores", "Piscina", "Jardinagem", "Obras e reformas", "Materiais", "Seguros", "Administradora", "Serviços bancários", "Outras despesas",
  ],
  income: ["Taxa condominial", "Fundo de reserva", "Taxa extra", "Multas e juros", "Aluguel de áreas comuns", "Rendimentos", "Outras receitas"],
};

export const PAYMENT_METHODS = ["Pix", "Boleto", "Transferência", "Cartão", "Débito automático", "Dinheiro", "Outro"];

export const ATTACHMENT_KINDS = { invoice: "Nota fiscal", slip: "Boleto", receipt: "Comprovante", other: "Outro" } as const;
export type AttachmentKind = keyof typeof ATTACHMENT_KINDS;

/** Arquivos aceitos nos anexos: PDF, imagens e o XML da NF-e. */
export const ATTACHMENT_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/xml": "xml",
  "text/xml": "xml",
};
/** Limite por arquivo (o corpo da requisição na Vercel vai até ~4,5 MB). */
export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;

export const LOG_LABEL: Record<string, string> = {
  created: "criou o lançamento",
  updated: "editou",
  viewed: "visualizou",
  deleted: "excluiu o lançamento",
  restored: "restaurou o lançamento",
  attachment_added: "anexou",
  attachment_removed: "removeu o anexo",
  attachment_viewed: "abriu o anexo",
  council_access: "alterou o acesso do conselho",
  exported: "gerou um relatório",
  budget_updated: "alterou o orçamento",
};

/** Rótulos dos campos no histórico de edição. */
export const FIELD_LABEL: Record<string, string> = {
  type: "Tipo",
  category: "Categoria",
  description: "Descrição",
  counterparty: "Fornecedor / pagador",
  document: "Nº do documento",
  amountCents: "Valor",
  date: "Competência",
  dueDate: "Vencimento",
  paidAt: "Pagamento",
  status: "Situação",
  paymentMethod: "Forma de pagamento",
  notes: "Observações",
};

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
// "−" (sinal de menos) em vez de hífen: a linha nunca quebra entre o sinal e o valor
export const fmtBRL = (cents: number) => brl.format(cents / 100).replace("-", "\u2212");

/** "1.234,56", "1234.56", "120.000" (milhar) ou "1234" → centavos. null se inválido. */
export function parseBRL(input: string): number | null {
  let s = input.replace(/[R$\s]/g, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if ((s.match(/\./g) ?? []).length > 1 || /^\d{1,3}\.\d{3}$/.test(s)) s = s.replace(/\./g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}

/** Centavos → "1.234,56" para o campo do formulário. */
export const centsToInput = (cents: number) => (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Data só (sem hora) gravada ao meio-dia de Brasília, para não "pular" de dia em fuso nenhum. */
export const dayToDate = (ymd: string) => new Date(`${ymd}T12:00:00-03:00`);
export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Date → "YYYY-MM-DD" no fuso de Brasília (para inputs type=date). */
export function dateToDay(d: Date | string | null | undefined) {
  if (!d) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(d));
}

export function fmtDayBR(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(d));
}

export function fmtSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}
