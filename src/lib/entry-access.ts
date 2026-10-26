// Quem pode abrir uma sessão: fora o superadmin, só quem tem pelo menos um condomínio liberado
// (o vínculo ativo em User.condominiumId ou algum outro vínculo). Seguro para client e server.

/** ok = liberado; archived = condomínio arquivado; expired = demonstração externa com o prazo vencido. */
export type CondoState = "ok" | "archived" | "expired";

export type EntryCheck = {
  role: string;
  /** Condomínio do vínculo ativo (null = nenhum). */
  activeCondo: CondoState | null;
  /** Condomínio de cada vínculo (Membership). */
  links: CondoState[];
};

/** Situação de um condomínio para entrar. */
export function condoState(c: { deletedAt: Date | null; demoExpiresAt: Date | null }, nowMs: number): CondoState {
  if (c.deletedAt) return "archived";
  if (c.demoExpiresAt && c.demoExpiresAt.getTime() <= nowMs) return "expired";
  return "ok";
}

/** Mensagem para quem não pode entrar, ou null quando pode. */
export function entryBlockReason({ role, activeCondo, links }: EntryCheck): string | null {
  if (role === "superadmin") return null;
  const all = [...(activeCondo ? [activeCondo] : []), ...links];
  if (all.includes("ok")) return null;
  if (all.includes("expired")) return "O período de teste desta demonstração terminou. Fale com quem enviou o acesso para continuar.";
  if (all.length) return "Seu condomínio não está mais na plataforma. Fale com a administração.";
  return "Sua conta ainda não está vinculada a nenhum condomínio. Peça à administração para fazer o vínculo e tente de novo.";
}
