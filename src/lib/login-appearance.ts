// Aparência da página de login: textos, cores e imagens editáveis em
// Configurações → Página de login. Seguro para client e server.

export const LOGIN_DEFAULTS = {
  pageTitle: "Entrar",
  // Marca e cores
  showLogo: true,
  logoUrl: "",
  logoHeight: 34,
  accentColor: "",
  formBg: "",
  titleColor: "",
  textColor: "",
  // Formulário
  title: "Bem-vindo de volta",
  showSubtitle: true,
  subtitle: "Entre para acompanhar os serviços do seu condomínio.",
  emailLabel: "E-mail",
  emailPlaceholder: "voce@condominio.com",
  passwordLabel: "Senha",
  passwordPlaceholder: "••••••••",
  buttonText: "Entrar",
  passkeyText: "Entrar com Face ID / biometria",
  dividerText: "ou com e-mail e senha",
  showHelp: true,
  helpText: "Esqueceu a senha? Solicite a redefinição à administração do condomínio.",
  // Painel lateral
  showHero: true,
  heroStyle: "gradient",
  heroColor1: "#7b7bf2",
  heroColor2: "#4338ca",
  heroImageUrl: "",
  heroOverlay: 45,
  heroTextColor: "#ffffff",
  showGlow: true,
  showBadge: true,
  badgeText: "Transparência em cada serviço",
  headline: "Cada serviço do condomínio, do chamado à aprovação.",
  showDescription: true,
  description: "Fotos de antes e depois, validação do zelador e aprovação do síndico — visível para todos os moradores.",
  // Cartão de exemplo
  showCard: true,
  cardProtocol: "OS-2026-00012",
  cardStatus: "Aprovada",
  cardTitle: "Repintura do hall de entrada",
  beforeLabel: "Antes",
  afterLabel: "Depois",
  beforeImageUrl: "",
  afterImageUrl: "",
  steps: "Aberta, Em execução, Validada, Aprovada",
  showToast: true,
  toastTitle: "Validado pelo zelador",
  toastTime: "há 2 horas",
};

export type LoginAppearance = typeof LOGIN_DEFAULTS;
export type LoginKey = keyof LoginAppearance;

type Kind = "text" | "textarea" | "color" | "image" | "boolean" | "number" | "select";
export type LoginField = {
  key: LoginKey;
  label: string;
  kind: Kind;
  hint?: string;
  min?: number;
  max?: number;
  options?: { value: string; label: string }[];
  /** Só aparece quando esta chave booleana estiver ligada (ou o select tiver um destes valores). */
  when?: { key: LoginKey; in?: string[] };
};

export const LOGIN_SECTIONS: { title: string; fields: LoginField[] }[] = [
  {
    title: "Marca e cores",
    fields: [
      { key: "pageTitle", label: "Título da aba do navegador", kind: "text" },
      { key: "showLogo", label: "Mostrar logo", kind: "boolean" },
      { key: "logoUrl", label: "Logo personalizado", kind: "image", hint: "PNG com fundo transparente. Vazio = logo do Condtrack.", when: { key: "showLogo" } },
      { key: "logoHeight", label: "Altura do logo (px)", kind: "number", min: 20, max: 120, when: { key: "showLogo" } },
      { key: "accentColor", label: "Cor principal", kind: "color", hint: "Botão, foco dos campos e links." },
      { key: "formBg", label: "Fundo do formulário", kind: "color" },
      { key: "titleColor", label: "Cor do título", kind: "color" },
      { key: "textColor", label: "Cor dos textos", kind: "color", hint: "Subtítulo, rótulos dos campos e ajuda." },
    ],
  },
  {
    title: "Textos do formulário",
    fields: [
      { key: "title", label: "Título", kind: "text" },
      { key: "showSubtitle", label: "Mostrar subtítulo", kind: "boolean" },
      { key: "subtitle", label: "Subtítulo", kind: "textarea", when: { key: "showSubtitle" } },
      { key: "emailLabel", label: "Rótulo do e-mail", kind: "text" },
      { key: "emailPlaceholder", label: "Exemplo no campo de e-mail", kind: "text" },
      { key: "passwordLabel", label: "Rótulo da senha", kind: "text" },
      { key: "passwordPlaceholder", label: "Exemplo no campo de senha", kind: "text" },
      { key: "buttonText", label: "Texto do botão", kind: "text" },
      { key: "passkeyText", label: "Botão de Face ID / biometria", kind: "text", hint: "Aparece quando a biometria está ativa." },
      { key: "dividerText", label: "Texto do divisor", kind: "text" },
      { key: "showHelp", label: "Mostrar texto de ajuda", kind: "boolean" },
      { key: "helpText", label: "Texto de ajuda", kind: "textarea", when: { key: "showHelp" } },
    ],
  },
  {
    title: "Painel lateral",
    fields: [
      { key: "showHero", label: "Mostrar painel lateral", kind: "boolean", hint: "Aparece em telas largas (notebook e desktop)." },
      { key: "heroStyle", label: "Fundo", kind: "select", when: { key: "showHero" }, options: [{ value: "gradient", label: "Degradê" }, { value: "solid", label: "Cor sólida" }, { value: "image", label: "Imagem" }] },
      { key: "heroColor1", label: "Cor 1", kind: "color", when: { key: "showHero" } },
      { key: "heroColor2", label: "Cor 2", kind: "color", when: { key: "heroStyle", in: ["gradient"] } },
      { key: "heroImageUrl", label: "Imagem de fundo", kind: "image", when: { key: "heroStyle", in: ["image"] } },
      { key: "heroOverlay", label: "Película da cor 1 sobre a imagem (%)", kind: "number", min: 0, max: 95, when: { key: "heroStyle", in: ["image"] } },
      { key: "heroTextColor", label: "Cor dos textos do painel", kind: "color", when: { key: "showHero" } },
      { key: "showGlow", label: "Efeitos de luz", kind: "boolean", when: { key: "showHero" } },
      { key: "showBadge", label: "Mostrar selo no topo", kind: "boolean", when: { key: "showHero" } },
      { key: "badgeText", label: "Selo", kind: "text", when: { key: "showBadge" } },
      { key: "headline", label: "Frase principal", kind: "textarea", when: { key: "showHero" } },
      { key: "showDescription", label: "Mostrar descrição", kind: "boolean", when: { key: "showHero" } },
      { key: "description", label: "Descrição", kind: "textarea", when: { key: "showDescription" } },
    ],
  },
  {
    title: "Cartão de exemplo",
    fields: [
      { key: "showCard", label: "Mostrar cartão de OS", kind: "boolean", when: { key: "showHero" } },
      { key: "cardProtocol", label: "Protocolo", kind: "text", when: { key: "showCard" } },
      { key: "cardStatus", label: "Status", kind: "text", when: { key: "showCard" } },
      { key: "cardTitle", label: "Título do serviço", kind: "text", when: { key: "showCard" } },
      { key: "beforeLabel", label: "Rótulo “antes”", kind: "text", when: { key: "showCard" } },
      { key: "beforeImageUrl", label: "Foto do antes", kind: "image", when: { key: "showCard" } },
      { key: "afterLabel", label: "Rótulo “depois”", kind: "text", when: { key: "showCard" } },
      { key: "afterImageUrl", label: "Foto do depois", kind: "image", when: { key: "showCard" } },
      { key: "steps", label: "Etapas", kind: "text", hint: "Separadas por vírgula.", when: { key: "showCard" } },
      { key: "showToast", label: "Mostrar aviso flutuante", kind: "boolean", when: { key: "showCard" } },
      { key: "toastTitle", label: "Aviso", kind: "text", when: { key: "showToast" } },
      { key: "toastTime", label: "Horário do aviso", kind: "text", when: { key: "showToast" } },
    ],
  },
];

export const LOGIN_FIELDS = LOGIN_SECTIONS.flatMap((s) => s.fields);
export const LOGIN_IMAGE_KEYS = LOGIN_FIELDS.filter((f) => f.kind === "image").map((f) => f.key);

export const HEX_RE = /^#[0-9a-fA-F]{6}$/;
export const BRANDING_PREFIX = "/api/branding/";

/** Completa valores salvos com os padrões (e descarta tipos errados). */
export function withLoginDefaults(values: Record<string, unknown>): LoginAppearance {
  const out = { ...LOGIN_DEFAULTS } as Record<string, unknown>;
  for (const [k, def] of Object.entries(LOGIN_DEFAULTS)) {
    const v = values[k];
    if (v !== undefined && v !== null && typeof v === typeof def) out[k] = v;
  }
  return out as LoginAppearance;
}

/** Visibilidade de um campo no editor, conforme as dependências (em cadeia). */
export function fieldVisible(f: LoginField, a: LoginAppearance): boolean {
  if (!f.when) return true;
  const dep = LOGIN_FIELDS.find((x) => x.key === f.when!.key);
  if (dep && !fieldVisible(dep, a)) return false;
  const v = a[f.when.key];
  return f.when.in ? f.when.in.includes(String(v)) : !!v;
}

/** CSS do fundo do painel lateral. */
export function heroBackground(a: LoginAppearance) {
  if (a.heroStyle === "solid") return a.heroColor1;
  if (a.heroStyle === "image" && a.heroImageUrl) {
    const tint = `color-mix(in srgb, ${a.heroColor1} ${a.heroOverlay}%, transparent)`;
    return `linear-gradient(${tint}, ${tint}), url("${a.heroImageUrl}") center / cover no-repeat`;
  }
  return `linear-gradient(145deg, ${a.heroColor1} 0%, ${a.heroColor2} 100%)`;
}

export const loginSteps = (a: LoginAppearance) => a.steps.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 6);
