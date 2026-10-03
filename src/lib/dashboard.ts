// Blocos do painel (dashboard) de cada perfil que o usuário pode mostrar ou esconder
// pelo botão de ajustes. O morador não personaliza. Seguro para client e server.
import type { Role } from "./roles";

export type DashSection = { key: string; label: string };

export const DASHBOARD_SECTIONS: Record<Role, DashSection[]> = {
  superadmin: [
    { key: "stats", label: "Indicadores" },
    { key: "finance", label: "Resumo financeiro" },
    { key: "condos", label: "OS por condomínio" },
    { key: "ranking", label: "Ranking de eficiência" },
    { key: "late", label: "Alertas de OS atrasadas" },
  ],
  syndic: [
    { key: "stats", label: "Indicadores" },
    { key: "checklist", label: "Checklist de hoje" },
    { key: "finance", label: "Resumo financeiro" },
    { key: "pending", label: "Aprovações pendentes" },
    { key: "status", label: "OS por status" },
    { key: "category", label: "OS por categoria" },
    { key: "areas", label: "Áreas com mais manutenção" },
    { key: "providers", label: "Prestadores mais acionados" },
    { key: "activity", label: "Atividade recente" },
  ],
  caretaker: [
    { key: "stats", label: "Indicadores" },
    { key: "validate", label: "Aguardando sua validação" },
    { key: "urgent", label: "Urgências e atrasos" },
    { key: "checklist", label: "Checklist de hoje" },
  ],
  provider: [
    { key: "stats", label: "Indicadores" },
    { key: "rejected", label: "Devolvidas para ajuste" },
    { key: "in_progress", label: "Em andamento" },
    { key: "assigned", label: "A iniciar" },
    { key: "validation", label: "Em validação" },
  ],
  council: [
    { key: "finance", label: "Resumo financeiro" },
    { key: "feed", label: "Serviços recentes no prédio" },
    { key: "mine", label: "Minhas solicitações" },
    { key: "news", label: "Comunicados" },
  ],
  resident: [],
};

/** Função que diz se um bloco aparece, a partir do que o usuário escondeu. */
export function dashboardVisibility(hidden: string) {
  const set = new Set(hidden.split(",").filter(Boolean));
  return (key: string) => !set.has(key);
}
