// Prazo das demonstrações externas: por quantos dias as contas de teste entram. Seguro para client e server.

export const DEMO_TRIAL_DEFAULT_DAYS = 7;
export const DEMO_TRIAL_MAX_DAYS = 90;
const DAY = 86400_000;

/** Dias digitados na janela; vazio = padrão; fora de 1–90 = erro. */
export function parseTrialDays(raw: string): { days?: number; error?: string } {
  const v = raw.trim();
  if (!v) return { days: DEMO_TRIAL_DEFAULT_DAYS };
  const n = Number(v.replace(/\s*dias?$/i, ""));
  if (!Number.isInteger(n) || n < 1 || n > DEMO_TRIAL_MAX_DAYS) return { error: `Prazo: escolha de 1 a ${DEMO_TRIAL_MAX_DAYS} dias.` };
  return { days: n };
}

/** Fim do acesso: `days` dias a partir de agora (prorrogar conta a partir do fim atual, se ainda não passou). */
export function trialEnd(days: number, nowMs: number, currentEnd?: Date | null) {
  const from = currentEnd && currentEnd.getTime() > nowMs ? currentEnd.getTime() : nowMs;
  return new Date(from + days * DAY);
}

/** Situação do prazo: sem prazo, ativo (com dias restantes, arredondados para cima) ou encerrado. */
export function trialStatus(expiresAt: Date | null | undefined, nowMs: number): { kind: "none" } | { kind: "active"; daysLeft: number } | { kind: "expired" } {
  if (!expiresAt) return { kind: "none" };
  const left = expiresAt.getTime() - nowMs;
  if (left <= 0) return { kind: "expired" };
  return { kind: "active", daysLeft: Math.ceil(left / DAY) };
}

/** Texto curto para listas e cartões. */
export function trialLabel(expiresAt: Date | null | undefined, nowMs: number) {
  const s = trialStatus(expiresAt, nowMs);
  if (s.kind === "none") return null;
  if (s.kind === "expired") return "Teste encerrado";
  return s.daysLeft === 1 ? "Termina em 1 dia" : `Termina em ${s.daysLeft} dias`;
}

/** Só dígitos do telefone, com 55 na frente quando é número brasileiro (para o link do WhatsApp). */
export function whatsappNumber(phone: string | null | undefined) {
  const d = (phone ?? "").replace(/\D/g, "");
  if (d.length < 10) return null;
  return d.length <= 11 ? `55${d}` : d;
}
