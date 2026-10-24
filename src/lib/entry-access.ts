// Quem pode abrir uma sessão: fora o superadmin, só quem tem pelo menos um condomínio ativo
// (o vínculo ativo em User.condominiumId ou algum outro vínculo). Seguro para client e server.

export type EntryCheck = {
  role: string;
  /** Condomínio do vínculo ativo: null = nenhum; true = arquivado. */
  activeCondoArchived: boolean | null;
  /** Para cada vínculo (Membership): se o condomínio está arquivado. */
  linksArchived: boolean[];
};

/** Mensagem para quem não pode entrar, ou null quando pode. */
export function entryBlockReason({ role, activeCondoArchived, linksArchived }: EntryCheck): string | null {
  if (role === "superadmin") return null;
  if (activeCondoArchived === false || linksArchived.some((archived) => !archived)) return null;
  if (activeCondoArchived === true || linksArchived.length) return "Seu condomínio não está mais na plataforma. Fale com a administração.";
  return "Sua conta ainda não está vinculada a nenhum condomínio. Peça à administração para fazer o vínculo e tente de novo.";
}
