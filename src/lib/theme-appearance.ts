// Cores do sistema (todas as páginas), editáveis em Configurações → Aparência.
// Seguro para client e server. Vazio = cor padrão do tema.

export type ThemeMode = "light" | "dark";

/** Padrões de cada tema. Mantenha em sincronia com :root em globals.css. */
export const THEME_DEFAULTS = {
  light: {
    brand: "#5b5bd6",
    brandInk: "#ffffff",
    bg: "#f6f7f9",
    bg2: "#eef0f4",
    surface: "#ffffff",
    surface2: "#f9fafb",
    elevated: "#eef0fe",
    fg: "#0f172a",
    fg2: "#334155",
    muted: "#64748b",
    line: "#0f172a",
    ok: "#16a34a",
    warn: "#d97706",
    bad: "#dc2626",
    info: "#0284c7",
    chart1: "#5b5bd6",
    chart2: "#0e9384",
  },
  dark: {
    brand: "#8b8bf5",
    brandInk: "#0c0d11",
    bg: "#0c0d11",
    bg2: "#121319",
    surface: "#15171e",
    surface2: "#1b1e27",
    elevated: "#23233d",
    fg: "#f3f4f6",
    fg2: "#c4c8d2",
    muted: "#8b91a0",
    line: "#ffffff",
    ok: "#22c55e",
    warn: "#f59e0b",
    bad: "#f87171",
    info: "#38bdf8",
    chart1: "#7c7cf0",
    chart2: "#14a89a",
  },
};

export type ThemeKey = keyof typeof THEME_DEFAULTS.light;
export type ThemeColors = Record<ThemeKey, string>;
export type ThemeAppearance = {
  light: ThemeColors;
  dark: ThemeColors;
  /** Logo em degradê da cor principal (tema claro) em vez do índigo original. */
  logoFollowsBrand: boolean;
};

export const THEME_SECTIONS: { title: string; tokens: { key: ThemeKey; label: string; hint?: string }[] }[] = [
  {
    title: "Marca",
    tokens: [
      { key: "brand", label: "Cor principal", hint: "Botões, links, menu ativo, foco dos campos e destaques." },
      { key: "brandInk", label: "Texto sobre a cor principal", hint: "Automático: branco ou escuro, o que tiver mais contraste." },
    ],
  },
  {
    title: "Fundos",
    tokens: [
      { key: "bg", label: "Fundo da página" },
      { key: "bg2", label: "Fundo secundário", hint: "Faixas, campos de código, botões ao passar o mouse." },
      { key: "surface", label: "Cartões", hint: "Cartões, menus e campos de formulário." },
      { key: "surface2", label: "Cartões secundários", hint: "Blocos dentro de cartões e dicas dos gráficos." },
      { key: "elevated", label: "Destaque suave", hint: "Automático: um toque da cor principal sobre os cartões." },
    ],
  },
  {
    title: "Textos e bordas",
    tokens: [
      { key: "fg", label: "Texto principal" },
      { key: "fg2", label: "Texto secundário", hint: "Rótulos e textos de apoio." },
      { key: "muted", label: "Texto discreto", hint: "Legendas, datas e descrições." },
      { key: "line", label: "Bordas e divisórias", hint: "Aplicada com transparência sobre o fundo." },
    ],
  },
  {
    title: "Status",
    tokens: [
      { key: "ok", label: "Sucesso", hint: "Aprovada, ativo, concluído." },
      { key: "warn", label: "Atenção", hint: "Pendente, prazos próximos." },
      { key: "bad", label: "Erro", hint: "Reprovada, atrasada, exclusões." },
      { key: "info", label: "Informação", hint: "Em andamento, avisos neutros." },
    ],
  },
  {
    title: "Gráficos",
    tokens: [
      { key: "chart1", label: "Série 1", hint: "Automático: acompanha a cor principal." },
      { key: "chart2", label: "Série 2" },
    ],
  },
];

export const THEME_KEYS = THEME_SECTIONS.flatMap((s) => s.tokens.map((t) => t.key));
/** Cores que, vazias, são calculadas a partir da cor principal. */
export const DERIVED_KEYS: ThemeKey[] = ["brandInk", "elevated", "chart1"];

/** Atalhos de cor principal (claro / escuro). */
export const BRAND_PRESETS = [
  { name: "Índigo (padrão)", light: "", dark: "" },
  { name: "Azul", light: "#2563eb", dark: "#60a5fa" },
  { name: "Verde", light: "#15803d", dark: "#4ade80" },
  { name: "Verde-água", light: "#0f766e", dark: "#2dd4bf" },
  { name: "Laranja", light: "#c2410c", dark: "#fb923c" },
  { name: "Vinho", light: "#9f1239", dark: "#fb7185" },
  { name: "Grafite", light: "#334155", dark: "#cbd5e1" },
];

export const HEX_RE = /^#[0-9a-fA-F]{6}$/;
export const THEME_SETTING_KEY = "theme_appearance";

const emptyColors = () => Object.fromEntries(THEME_KEYS.map((k) => [k, ""])) as ThemeColors;
export const emptyTheme = (): ThemeAppearance => ({ light: emptyColors(), dark: emptyColors(), logoFollowsBrand: false });

/** Completa valores salvos (descarta o que não for cor #rrggbb). */
export function withThemeDefaults(values: unknown): ThemeAppearance {
  const v = (values && typeof values === "object" ? values : {}) as Record<string, unknown>;
  const out = emptyTheme();
  for (const mode of ["light", "dark"] as const) {
    const m = (v[mode] && typeof v[mode] === "object" ? v[mode] : {}) as Record<string, unknown>;
    for (const k of THEME_KEYS) {
      const c = m[k];
      if (typeof c === "string" && HEX_RE.test(c)) out[mode][k] = c.toLowerCase();
    }
  }
  out.logoFollowsBrand = v.logoFollowsBrand === true;
  return out;
}

export const isCustomized = (t: ThemeAppearance) => t.logoFollowsBrand || (["light", "dark"] as const).some((m) => THEME_KEYS.some((k) => t[m][k]));

// ───────────── Contraste (WCAG) ─────────────

function rgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function luminance(hex: string) {
  const [r, g, b] = rgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
const inkFor = (brand: string) => (contrast(brand, "#ffffff") >= contrast(brand, "#0c0d11") ? "#ffffff" : "#0c0d11");

/** Cor efetiva de cada chave (salva, calculada a partir da principal, ou padrão). */
export function resolveColors(t: ThemeAppearance, mode: ThemeMode): ThemeColors {
  const set = t[mode];
  const def = THEME_DEFAULTS[mode];
  const out = { ...def };
  for (const k of THEME_KEYS) if (set[k]) out[k] = set[k];
  if (set.brand) {
    if (!set.brandInk) out.brandInk = inkFor(set.brand);
    if (!set.chart1) out.chart1 = set.brand;
  }
  return out;
}

/** Variáveis CSS de um tema (mesmos nomes de globals.css). */
export function themeVars(t: ThemeAppearance, mode: ThemeMode): Record<string, string> {
  const c = resolveColors(t, mode);
  const set = t[mode];
  const dark = mode === "dark";
  const brandChanged = !!set.brand;
  const [lineA, lineB] = dark ? [7, 13] : [8, 14];
  const vars: Record<string, string> = {
    "--bg": c.bg,
    "--bg-2": c.bg2,
    "--surface": c.surface,
    "--surface-2": c.surface2,
    "--elevated": set.elevated || !brandChanged ? c.elevated : `color-mix(in srgb, ${c.brand} ${dark ? 12 : 10}%, ${c.surface})`,
    "--line": `color-mix(in srgb, ${c.line} ${lineA}%, transparent)`,
    "--line-strong": `color-mix(in srgb, ${c.line} ${lineB}%, transparent)`,
    "--fg": c.fg,
    "--fg-2": c.fg2,
    "--muted": c.muted,
    "--brand": c.brand,
    "--brand-2": brandChanged ? `color-mix(in srgb, ${c.brand} 88%, black)` : dark ? "#7a7aee" : "#4a4ac4",
    "--brand-ink": c.brandInk,
    "--brand-soft": `color-mix(in srgb, ${c.brand} ${dark ? 10 : 8}%, transparent)`,
    "--ok": c.ok,
    "--warn": c.warn,
    "--bad": c.bad,
    "--info": c.info,
    "--chart-1": c.chart1,
    "--chart-2": c.chart2,
  };
  if (t.logoFollowsBrand) Object.assign(vars, logoVars(resolveColors(t, "light").brand));
  return vars;
}

function logoVars(brand: string) {
  return {
    "--logo-1": `color-mix(in srgb, ${brand} 78%, white)`,
    "--logo-2": brand,
    "--logo-3": `color-mix(in srgb, ${brand} 78%, black)`,
  };
}

/** CSS injetado no <head>: só as variáveis que diferem do padrão. */
export function themeCss(t: ThemeAppearance): string {
  if (!isCustomized(t)) return "";
  const base = emptyTheme();
  const rules: string[] = [];
  for (const mode of ["light", "dark"] as const) {
    const cur = themeVars(t, mode);
    const def = themeVars(base, mode);
    const diff = Object.entries(cur).filter(([k, v]) => def[k] !== v);
    // html:root[...] vence :root[...] de globals.css independentemente da ordem
    if (diff.length) rules.push(`html:root[data-theme="${mode}"]{${diff.map(([k, v]) => `${k}:${v}`).join(";")}}`);
  }
  return rules.join("\n");
}

export type ContrastIssue = { label: string; ratio: number };

/** Combinações importantes com contraste abaixo de 4,5:1 (texto) ou 3:1 (texto grande/ícones). */
export function contrastIssues(t: ThemeAppearance, mode: ThemeMode): ContrastIssue[] {
  const c = resolveColors(t, mode);
  const checks: [string, string, string, number][] = [
    ["Texto principal sobre os cartões", c.fg, c.surface, 4.5],
    ["Texto principal sobre o fundo", c.fg, c.bg, 4.5],
    ["Texto discreto sobre os cartões", c.muted, c.surface, 3],
    ["Texto sobre a cor principal (botões)", c.brandInk, c.brand, 4.5],
    ["Cor principal sobre os cartões (links)", c.brand, c.surface, 3],
  ];
  return checks.filter(([, a, b, min]) => contrast(a, b) < min).map(([label, a, b]) => ({ label, ratio: Math.round(contrast(a, b) * 10) / 10 }));
}
