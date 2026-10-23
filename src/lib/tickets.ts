// Chamados (morador e conselho → síndico): regras puras (seguro para client e server, testado em __tests__/tickets.test.ts).
import type { Role } from "./roles";
import type { Tone } from "@/components/ui";

/** Quem abre chamados (vê só os próprios) e quem atende (vê todos do condomínio) */
export const TICKET_AUTHORS = ["resident", "council"] as const satisfies readonly Role[];
export const TICKET_MANAGERS = ["superadmin", "syndic"] as const satisfies readonly Role[];
export const TICKET_ROLES = [...TICKET_MANAGERS, ...TICKET_AUTHORS] as const;
export const canManageTickets = (role: Role) => (TICKET_MANAGERS as readonly Role[]).includes(role);
export const canOpenTicket = (role: Role) => (TICKET_AUTHORS as readonly Role[]).includes(role);

export const TICKET_KINDS = {
  problem: { label: "Problema ou conserto", short: "Problema", hint: "Algo quebrado, vazando ou sem funcionar", tone: "warn" },
  complaint: { label: "Reclamação", short: "Reclamação", hint: "Um serviço ou situação que não está bom", tone: "bad" },
  neighbor: { label: "Convivência", short: "Convivência", hint: "Barulho, vaga, animais, regras do condomínio", tone: "info" },
  suggestion: { label: "Sugestão", short: "Sugestão", hint: "Uma ideia para melhorar o condomínio", tone: "ok" },
  other: { label: "Outro assunto", short: "Outro", hint: "Dúvidas e pedidos em geral", tone: "muted" },
} as const satisfies Record<string, { label: string; short: string; hint: string; tone: Tone }>;
export type TicketKind = keyof typeof TICKET_KINDS;
export const isTicketKind = (v: unknown): v is TicketKind => typeof v === "string" && v in TICKET_KINDS;
export const ticketKind = (k: string) => TICKET_KINDS[k as TicketKind] ?? TICKET_KINDS.other;

export const TICKET_STATUS = {
  open: { label: "Aberto", tone: "warn" },
  in_review: { label: "Em análise", tone: "info" },
  converted: { label: "Virou OS", tone: "brand" },
  resolved: { label: "Resolvido", tone: "ok" },
  closed: { label: "Encerrado", tone: "muted" },
} as const satisfies Record<string, { label: string; tone: Tone }>;
export type TicketStatus = keyof typeof TICKET_STATUS;
export const ticketStatus = (s: string) => TICKET_STATUS[s as TicketStatus] ?? TICKET_STATUS.open;

/** Ainda pedem atenção de quem atende */
export const ACTIVE_STATUSES: TicketStatus[] = ["open", "in_review"];
/** Encerrados (resolvido ou não) */
export const DONE_STATUSES: TicketStatus[] = ["resolved", "closed"];
export const isDone = (s: string) => (DONE_STATUSES as string[]).includes(s);

/** Chamados em aberto por pessoa (evita a mesma reclamação repetida dezenas de vezes) */
export const MAX_OPEN_TICKETS = 5;
export const MAX_TICKET_PHOTOS = 5;
/** Dias depois de encerrado em que quem abriu ainda pode reabrir */
export const REOPEN_DAYS = 30;

type T = { status: string; createdById: string | null; closedAt?: Date | null };
type U = { id: string; role: Role };

export type TicketAction = "reply" | "review" | "convert" | "resolve" | "close" | "cancel" | "reopen";

/** O que a pessoa pode fazer no chamado agora (a visibilidade é conferida antes, em canViewTicket). */
export function canTicket(action: TicketAction, t: T, u: U, now = new Date()): boolean {
  const manager = canManageTickets(u.role);
  const author = !!t.createdById && t.createdById === u.id;
  switch (action) {
    case "reply":
      return (manager || author) && !isDone(t.status);
    case "review":
      return manager && t.status === "open";
    case "convert":
      return manager && (ACTIVE_STATUSES as string[]).includes(t.status);
    case "resolve":
    case "close":
      return manager && !isDone(t.status);
    case "cancel":
      // Quem abriu desiste enquanto ninguém começou a tratar
      return author && t.status === "open";
    case "reopen":
      return author && isDone(t.status) && !!t.closedAt && now.getTime() - t.closedAt.getTime() <= REOPEN_DAYS * 86400_000;
  }
}

/** Quem abriu vê os próprios; quem atende vê todos do condomínio */
export function canViewTicket(t: { createdById: string | null; condominiumId: string }, u: U & { condominiumId: string | null }, scopeId?: string | null) {
  if (u.role === "superadmin") return !scopeId || scopeId === t.condominiumId;
  if (u.role === "syndic") return u.condominiumId === t.condominiumId;
  return !!t.createdById && t.createdById === u.id;
}

/** Resposta de quem atende num chamado aberto o põe em análise */
export function statusAfterReply(status: string, byManager: boolean): string {
  return byManager && status === "open" ? "in_review" : status;
}

/** Tempo até a primeira resposta, em horas (null sem resposta) */
export function responseHours(t: { createdAt: Date; answeredAt: Date | null }) {
  return t.answeredAt ? Math.max(0, (t.answeredAt.getTime() - t.createdAt.getTime()) / 3600_000) : null;
}

/** "agora há pouco", "3 h", "2 dias" */
export function ageLabel(from: Date, now = new Date()) {
  const h = (now.getTime() - from.getTime()) / 3600_000;
  if (h < 1) return "agora há pouco";
  if (h < 24) return `há ${Math.floor(h)} h`;
  const d = Math.floor(h / 24);
  return `há ${d} dia${d === 1 ? "" : "s"}`;
}

/** Média de horas até a primeira resposta, formatada ("—" sem dados) */
export function avgResponseLabel(list: { createdAt: Date; answeredAt: Date | null }[]) {
  const hs = list.map(responseHours).filter((x): x is number => x !== null);
  if (!hs.length) return "—";
  const avg = hs.reduce((a, b) => a + b, 0) / hs.length;
  if (avg < 1) return "menos de 1 h";
  if (avg < 48) return `${Math.round(avg)} h`;
  return `${Math.round(avg / 24)} dias`;
}
