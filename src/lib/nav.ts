import type { Role } from "./roles";

export type NavItem = { href: string; label: string; icon: string; mobile?: boolean; short?: string };

// Ordem padrão (cada pessoa pode reordenar segurando e arrastando). Mesma lógica em todos os perfis:
// dia a dia (painel, OS, checklist, manutenção) → dinheiro e prestação de contas → comunicação →
// cadastros → administração → Meus condomínios (o cartão do topo do menu já troca de condomínio).
export const NAV: Record<Role, NavItem[]> = {
  superadmin: [
    { href: "/dashboard", label: "Visão global", short: "Início", icon: "gauge", mobile: true },
    { href: "/admin/condominios", label: "Condomínios", icon: "building", mobile: true },
    { href: "/os", label: "Ordens de serviço", short: "OS", icon: "clipboard", mobile: true },
    { href: "/feed", label: "Feed de serviços", icon: "sparkles" },
    { href: "/checklist", label: "Checklist", icon: "checklist" },
    { href: "/manutencao", label: "Manutenção preventiva", short: "Preventiva", icon: "wrench" },
    { href: "/financeiro", label: "Financeiro", icon: "wallet" },
    { href: "/relatorios", label: "Relatórios", icon: "report" },
    { href: "/comunicados", label: "Comunicados", icon: "megaphone" },
    { href: "/assembleias", label: "Assembleias", icon: "vote" },
    { href: "/admin/usuarios", label: "Usuários", icon: "users", mobile: true },
    { href: "/admin/assinaturas", label: "Assinaturas", icon: "card", mobile: true },
    { href: "/admin/auditoria", label: "Auditoria", icon: "shield" },
    { href: "/admin/configuracoes", label: "Configurações", icon: "settings" },
  ],
  syndic: [
    { href: "/dashboard", label: "Dashboard", icon: "gauge", mobile: true },
    { href: "/os", label: "Ordens de serviço", short: "OS", icon: "clipboard", mobile: true },
    { href: "/feed", label: "Feed de serviços", short: "Feed", icon: "sparkles", mobile: true },
    { href: "/checklist", label: "Checklist", icon: "checklist" },
    { href: "/manutencao", label: "Manutenção preventiva", short: "Preventiva", icon: "wrench" },
    { href: "/financeiro", label: "Financeiro", icon: "wallet", mobile: true },
    { href: "/relatorios", label: "Relatórios", icon: "report" },
    { href: "/comunicados", label: "Comunicados", icon: "megaphone" },
    { href: "/assembleias", label: "Assembleias", icon: "vote" },
    { href: "/usuarios", label: "Pessoas", icon: "users", mobile: true },
    { href: "/estrutura", label: "Estrutura", icon: "building" },
    { href: "/auditoria", label: "Auditoria", icon: "shield" },
    { href: "/assinatura", label: "Assinatura", icon: "card", mobile: true },
    { href: "/meus-condominios", label: "Meus condomínios", short: "Prédios", icon: "buildings" },
  ],
  caretaker: [
    { href: "/dashboard", label: "Meu dia", icon: "gauge", mobile: true },
    { href: "/checklist", label: "Checklist", icon: "checklist", mobile: true },
    { href: "/os", label: "Ordens de serviço", short: "OS", icon: "clipboard", mobile: true },
    { href: "/os/nova", label: "Nova ocorrência", short: "Nova", icon: "plus", mobile: true },
    { href: "/manutencao", label: "Manutenção preventiva", short: "Preventiva", icon: "wrench" },
    { href: "/feed", label: "Feed de serviços", short: "Feed", icon: "sparkles", mobile: true },
    { href: "/comunicados", label: "Comunicados", icon: "megaphone" },
    { href: "/assembleias", label: "Assembleias", icon: "vote" },
    { href: "/meus-condominios", label: "Meus condomínios", short: "Prédios", icon: "buildings" },
  ],
  provider: [
    { href: "/dashboard", label: "Minhas OS", icon: "clipboard", mobile: true },
    { href: "/os?h=1", label: "Meu histórico", short: "Histórico", icon: "history", mobile: true },
    { href: "/meus-condominios", label: "Meus condomínios", short: "Prédios", icon: "buildings" },
  ],
  council: [
    { href: "/dashboard", label: "Início", icon: "home", mobile: true },
    { href: "/os", label: "Minhas solicitações", short: "Solicitações", icon: "clipboard", mobile: true },
    { href: "/os/nova", label: "Nova solicitação", short: "Nova", icon: "plus", mobile: true },
    { href: "/feed", label: "Serviços do prédio", short: "Serviços", icon: "sparkles", mobile: true },
    { href: "/financeiro", label: "Financeiro", icon: "wallet" },
    { href: "/relatorios", label: "Relatórios", icon: "report" },
    { href: "/comunicados", label: "Comunicados", icon: "megaphone" },
    { href: "/assembleias", label: "Assembleias", icon: "vote" },
    { href: "/meus-condominios", label: "Meus condomínios", short: "Prédios", icon: "buildings" },
  ],
  // Morador: somente visualização (vota em assembleia quando é proprietário)
  resident: [
    { href: "/dashboard", label: "Início", icon: "home", mobile: true },
    { href: "/feed", label: "Serviços entregues", short: "Serviços", icon: "sparkles", mobile: true },
    { href: "/assembleias", label: "Assembleias", icon: "vote", mobile: true },
    { href: "/meus-condominios", label: "Meus condomínios", short: "Prédios", icon: "buildings" },
  ],
};
