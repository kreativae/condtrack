// Estilo do menu lateral (computador), escolhido pelo superadmin em Configurações → Aparência.
// Seguro para client e server.
import type { NavItem } from "./nav";

export const MENU_STYLES = {
  sections: { label: "Seções", hint: "Grupos com título, sempre abertos; Auditoria e Configurações no cartão do seu nome. Recomendado." },
  classic: { label: "Atual", hint: "Lista completa, como sempre foi." },
  accordion: { label: "Sanfona", hint: "Itens em grupos por assunto que abrem e fecham. Mais curto e organizado." },
  more: { label: "Com “Mais”", hint: "Os 7 primeiros da ordem de cada pessoa à vista; o resto em “Mais”." },
  compact: { label: "Compacto", hint: "Lista completa com itens mais baixos." },
} as const;
export type MenuStyle = keyof typeof MENU_STYLES;
export const isMenuStyle = (v: unknown): v is MenuStyle => typeof v === "string" && v in MENU_STYLES;

export const MENU_SETTING_KEY = "menu_style";
/** Itens sempre à vista no estilo "Mais". */
export const MORE_VISIBLE = 7;
/** Abaixo disso não vale agrupar: a sanfona vira a lista compacta. */
export const ACCORDION_MIN = 8;

/** Grupos da sanfona, na ordem em que aparecem. */
export const NAV_GROUPS = [
  { key: "inicio", label: "" },
  { key: "dia", label: "Dia a dia" },
  { key: "dinheiro", label: "Dinheiro" },
  { key: "comunicacao", label: "Comunicação" },
  { key: "portaria", label: "Portaria e reservas" },
  { key: "admin", label: "Administração" },
  { key: "plataforma", label: "Plataforma" },
] as const;
export type NavGroupKey = (typeof NAV_GROUPS)[number]["key"];

/** Em que grupo fica cada página (o que não estiver aqui vai para "Dia a dia"). */
const GROUP_OF: Record<string, NavGroupKey> = {
  "/dashboard": "inicio",
  "/financeiro": "dinheiro", "/relatorios": "dinheiro",
  "/comunicados": "comunicacao", "/assembleias": "comunicacao", "/feed": "comunicacao",
  "/reservas": "portaria", "/portaria": "portaria", "/minha-unidade": "portaria",
  "/admin/condominios": "plataforma", "/admin/usuarios": "plataforma", "/admin/assinaturas": "plataforma", "/admin/interessados": "plataforma",
  "/usuarios": "admin", "/assinatura": "admin",
  "/admin/auditoria": "admin", "/auditoria": "admin", "/admin/configuracoes": "admin", "/estrutura": "admin", "/meus-condominios": "admin",
};
export const groupOf = (href: string): NavGroupKey => GROUP_OF[href.split("?")[0]] ?? "dia";

/** Estilo "Seções": páginas que saem da lista e vão para o cartão do nome (rodapé do menu). */
export const USER_MENU_HREFS = ["/admin/auditoria", "/auditoria", "/admin/configuracoes"];

export type NavSection = { key: NavGroupKey; label: string; items: NavItem[] };

/**
 * Menu "Seções": a lista (já na ordem da pessoa) dividida nos grupos de NAV_GROUPS, sempre abertos, sem os grupos
 * vazios; Auditoria e Configurações vão para `userMenu`. O feed de serviços fica em Comunicação.
 */
export function sectionLayout(items: NavItem[]): { sections: NavSection[]; userMenu: NavItem[] } {
  const userMenu = USER_MENU_HREFS.map((h) => items.find((it) => it.href === h)).filter((it): it is NavItem => !!it);
  const rest = items.filter((it) => !USER_MENU_HREFS.includes(it.href));
  const sections = NAV_GROUPS.map((g) => ({ key: g.key, label: g.label, items: rest.filter((it) => groupOf(it.href) === g.key) })).filter((g) => g.items.length);
  return { sections, userMenu };
}
