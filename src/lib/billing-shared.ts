// Constantes e formatação de billing — seguras para client e server.

export const TRIAL_DAYS = 14;

export type Interval = "month" | "year";

export const SUB_STATUS: Record<string, { label: string; tone: "ok" | "warn" | "bad" | "muted" | "info" | "brand" }> = {
  trialing: { label: "Em teste", tone: "info" },
  active: { label: "Ativa", tone: "ok" },
  past_due: { label: "Pagamento pendente", tone: "warn" },
  unpaid: { label: "Inadimplente", tone: "bad" },
  canceled: { label: "Cancelada", tone: "muted" },
  incomplete: { label: "Incompleta", tone: "warn" },
  incomplete_expired: { label: "Expirada", tone: "muted" },
  paused: { label: "Pausada", tone: "muted" },
  none: { label: "Sem assinatura", tone: "muted" },
};

export const INVOICE_STATUS: Record<string, { label: string; tone: "ok" | "warn" | "bad" | "muted" | "info" }> = {
  paid: { label: "Paga", tone: "ok" },
  open: { label: "Em aberto", tone: "warn" },
  draft: { label: "Rascunho", tone: "muted" },
  void: { label: "Anulada", tone: "muted" },
  uncollectible: { label: "Incobrável", tone: "bad" },
};

/** Status que contam como "pagante" (entram no MRR). */
export const PAYING = ["active", "past_due"];
/** Status em que o condomínio tem acesso ao sistema. */
export const ENTITLED = ["trialing", "active", "past_due"];

export function brl(cents: number | null | undefined) {
  if (cents == null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

export function monthlyEquivalent(amount: number, interval: string) {
  return interval === "year" ? Math.round(amount / 12) : amount;
}
