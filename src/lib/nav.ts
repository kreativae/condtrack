import type { Role } from "./roles";

export type NavItem = { href: string; label: string; icon: string; mobile?: boolean; short?: string };

export const NAV: Record<Role, NavItem[]> = {
  superadmin: [
    { href: "/dashboard", label: "Visão global", short: "Início", icon: "gauge", mobile: true },
    { href: "/admin/condominios", label: "Condomínios", icon: "building", mobile: true },
    { href: "/os", label: "Ordens de serviço", short: "OS", icon: "clipboard", mobile: true },
    { href: "/feed", label: "Feed de serviços", icon: "sparkles" },
    { href: "/admin/usuarios", label: "Usuários", icon: "users", mobile: true },
    { href: "/admin/assinaturas", label: "Assinaturas", icon: "card", mobile: true },
    { href: "/admin/auditoria", label: "Auditoria", icon: "shield" },
    { href: "/admin/configuracoes", label: "Configurações", icon: "settings" },
  ],
  syndic: [
    { href: "/dashboard", label: "Dashboard", icon: "gauge", mobile: true },
    { href: "/os", label: "Ordens de serviço", short: "OS", icon: "clipboard", mobile: true },
    { href: "/feed", label: "Feed de serviços", short: "Feed", icon: "sparkles", mobile: true },
    { href: "/usuarios", label: "Pessoas", icon: "users", mobile: true },
    { href: "/checklist", label: "Checklist", icon: "checklist" },
    { href: "/estrutura", label: "Estrutura", icon: "building" },
    { href: "/comunicados", label: "Comunicados", icon: "megaphone" },
    { href: "/assinatura", label: "Assinatura", icon: "card", mobile: true },
  ],
  caretaker: [
    { href: "/dashboard", label: "Meu dia", icon: "gauge", mobile: true },
    { href: "/os", label: "Ordens de serviço", short: "OS", icon: "clipboard", mobile: true },
    { href: "/os/nova", label: "Nova ocorrência", short: "Nova", icon: "plus", mobile: true },
    { href: "/feed", label: "Feed de serviços", short: "Feed", icon: "sparkles", mobile: true },
    { href: "/checklist", label: "Checklist", icon: "checklist", mobile: true },
    { href: "/comunicados", label: "Comunicados", icon: "megaphone" },
  ],
  provider: [
    { href: "/dashboard", label: "Minhas OS", icon: "clipboard", mobile: true },
    { href: "/os?h=1", label: "Meu histórico", short: "Histórico", icon: "history", mobile: true },
  ],
  council: [
    { href: "/dashboard", label: "Início", icon: "home", mobile: true },
    { href: "/feed", label: "Serviços do prédio", short: "Serviços", icon: "sparkles", mobile: true },
    { href: "/os", label: "Minhas solicitações", short: "Solicitações", icon: "clipboard", mobile: true },
    { href: "/os/nova", label: "Nova solicitação", short: "Nova", icon: "plus", mobile: true },
    { href: "/comunicados", label: "Comunicados", icon: "megaphone" },
  ],
  // Morador: somente visualização
  resident: [
    { href: "/dashboard", label: "Início", icon: "home", mobile: true },
    { href: "/feed", label: "Serviços entregues", short: "Serviços", icon: "sparkles", mobile: true },
  ],
};
