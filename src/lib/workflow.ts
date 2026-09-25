import type { Role } from "./roles";

export const STATUSES = [
  "open",
  "assigned",
  "in_progress",
  "completed",
  "validated",
  "approved",
  "rejected",
  "cancelled",
] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_META: Record<Status, { label: string; tone: "info" | "warn" | "ok" | "bad" | "muted" | "brand" }> = {
  open: { label: "Aberta", tone: "info" },
  assigned: { label: "Atribuída", tone: "info" },
  in_progress: { label: "Em andamento", tone: "warn" },
  completed: { label: "Aguardando validação", tone: "warn" },
  validated: { label: "Aguardando aprovação", tone: "brand" },
  approved: { label: "Aprovada", tone: "ok" },
  rejected: { label: "Devolvida", tone: "bad" },
  cancelled: { label: "Cancelada", tone: "muted" },
};

export const PRIORITY_META = {
  urgent: { label: "Urgente", tone: "bad", hours: 24 },
  high: { label: "Alta", tone: "warn", hours: 72 },
  medium: { label: "Média", tone: "info", hours: 7 * 24 },
  low: { label: "Baixa", tone: "muted", hours: 15 * 24 },
} as const;
export type Priority = keyof typeof PRIORITY_META;

export const PHASE_LABEL = { opening: "Ocorrência", before: "Antes", during: "Durante", after: "Depois" } as const;
export type Phase = keyof typeof PHASE_LABEL;

/** Etapas exibidas na linha do tempo (ordem do fluxo principal). */
export const FLOW_STEPS: { status: Status; label: string }[] = [
  { status: "open", label: "Abertura" },
  { status: "assigned", label: "Atribuição" },
  { status: "in_progress", label: "Execução" },
  { status: "completed", label: "Concluída" },
  { status: "validated", label: "Validação" },
  { status: "approved", label: "Aprovação" },
];

export const ACTIVE_STATUSES: Status[] = ["open", "assigned", "in_progress", "completed", "validated", "rejected"];

export const MAX_MEDIA_PER_PHASE = 10;
export const MAX_VIDEO_SECONDS = 120;

export type OrderAction =
  | "assign"
  | "start"
  | "complete"
  | "validate"
  | "return"
  | "approve"
  | "reject"
  | "cancel"
  | "rate"
  | "upload_before"
  | "upload_after";

type OrderLike = {
  status: string;
  condominiumId: string;
  assignedToId: string | null;
  requestedById: string | null;
  rating: number | null;
};
type UserLike = { id: string; role: Role; condominiumId: string | null };

function sameCondo(o: OrderLike, u: UserLike) {
  return u.role === "superadmin" || o.condominiumId === u.condominiumId;
}

/** Regras de transição da OS por papel. Fonte única para UI e server actions. */
export function can(action: OrderAction, o: OrderLike, u: UserLike): boolean {
  if (!sameCondo(o, u)) return false;
  const manager = u.role === "syndic" || u.role === "superadmin";
  const isProvider = u.role === "provider" && o.assignedToId === u.id;
  const s = o.status as Status;

  switch (action) {
    case "assign":
      return manager && ["open", "assigned", "rejected"].includes(s);
    case "upload_before":
      // Superadmin pode completar o registro em qualquer etapa (ex.: OS aprovada pela edição administrativa)
      if (u.role === "superadmin") return !["open", "cancelled"].includes(s);
      return (isProvider || manager) && ["assigned", "rejected"].includes(s);
    case "start":
      return isProvider && ["assigned", "rejected"].includes(s);
    case "upload_after":
      if (u.role === "superadmin") return !["open", "cancelled"].includes(s);
      return (isProvider || manager) && s === "in_progress";
    case "complete":
      return isProvider && s === "in_progress";
    case "validate":
    case "return":
      return (u.role === "caretaker" || manager) && s === "completed";
    case "approve":
      return manager && s === "validated";
    case "reject":
      return manager && (s === "validated" || s === "completed");
    case "cancel":
      return (manager && !["approved", "cancelled"].includes(s)) || (o.requestedById === u.id && s === "open");
    case "rate":
      return o.requestedById === u.id && s === "approved" && o.rating == null;
  }
}

/** Quem pode visualizar a OS (detalhe). Conselho vê as próprias e as aprovadas; morador só as aprovadas (feed). */
/**
 * Excluir mídia anexada: quem enviou pode apagar até a OS ser aprovada/cancelada;
 * síndico e superadmin podem apagar qualquer uma (correções depois da aprovação).
 */
export function canDeleteMedia(o: OrderLike, m: { uploadedById: string | null }, u: UserLike) {
  if (!sameCondo(o, u)) return false;
  if (u.role === "superadmin" || u.role === "syndic") return true;
  return m.uploadedById === u.id && !["approved", "cancelled"].includes(o.status);
}

export function canView(o: OrderLike, u: UserLike) {
  if (!sameCondo(o, u)) return false;
  switch (u.role) {
    case "superadmin":
    case "syndic":
    case "caretaker":
      return true;
    case "provider":
      return o.assignedToId === u.id;
    case "council":
      return o.requestedById === u.id || o.status === "approved";
    case "resident":
      return o.status === "approved";
  }
}

export function isOverdue(o: { dueDate: Date | null; status: string }) {
  return !!o.dueDate && ACTIVE_STATUSES.includes(o.status as Status) && o.dueDate.getTime() < Date.now();
}
