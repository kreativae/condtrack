// Estilo do menu lateral (computador), escolhido pelo superadmin em Configurações → Aparência.
// Seguro para client e server.

export const MENU_STYLES = {
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
  { key: "dia", label: "Dia a dia" },
  { key: "dinheiro", label: "Dinheiro" },
  { key: "comunicacao", label: "Comunicação" },
  { key: "admin", label: "Administração" },
] as const;
export type NavGroupKey = (typeof NAV_GROUPS)[number]["key"];

/** Em que grupo fica cada página (o que não estiver aqui vai para "Dia a dia"). */
const GROUP_OF: Record<string, NavGroupKey> = {
  "/financeiro": "dinheiro", "/relatorios": "dinheiro",
  "/comunicados": "comunicacao", "/assembleias": "comunicacao",
  "/admin/condominios": "admin", "/admin/usuarios": "admin", "/usuarios": "admin", "/admin/assinaturas": "admin", "/assinatura": "admin",
  "/admin/auditoria": "admin", "/auditoria": "admin", "/admin/configuracoes": "admin", "/estrutura": "admin", "/meus-condominios": "admin",
};
export const groupOf = (href: string): NavGroupKey => GROUP_OF[href.split("?")[0]] ?? "dia";
