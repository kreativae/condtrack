// Pedidos de demonstração do site (página inicial): validação do formulário e rótulos. Seguro para client e server.

export const REQUEST_PROFILES = [
  { key: "syndic", label: "Síndico morador" },
  { key: "pro", label: "Síndico profissional" },
  { key: "administrator", label: "Administradora" },
  { key: "other", label: "Outro" },
] as const;
export type RequestProfile = (typeof REQUEST_PROFILES)[number]["key"];

export const REQUEST_STATUS = {
  new: { label: "Novo", tone: "brand" },
  contacted: { label: "Em contato", tone: "info" },
  demo: { label: "Demonstração criada", tone: "warn" },
  won: { label: "Virou cliente", tone: "ok" },
  lost: { label: "Não seguiu", tone: "muted" },
} as const;
export type RequestStatus = keyof typeof REQUEST_STATUS;
export const isRequestStatus = (s: string): s is RequestStatus => s in REQUEST_STATUS;

export const profileLabel = (key: string) => REQUEST_PROFILES.find((p) => p.key === key)?.label ?? key;

/** Pedidos aceitos por endereço de IP e por e-mail (o resto recebe a mesma resposta, sem gravar). */
export const REQUEST_LIMITS = { perIpPerHour: 5, perEmailPerDay: 3 };

export type DemoRequestInput = { name: string; email: string; phone: string; condoName: string; units: number | null; profile: RequestProfile; message: string | null };
export type DemoRequestErrors = Partial<Record<"name" | "email" | "phone" | "condoName" | "units" | "profile", string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const clean = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** Telefone brasileiro com DDD (10 ou 11 dígitos, com ou sem 55 na frente) → "(11) 98888-7777"; senão null. */
export function formatPhone(raw: string) {
  let d = raw.replace(/\D/g, "");
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return null;
  if (d[0] === "0") return null;
  const cut = d.length - 4;
  return `(${d.slice(0, 2)}) ${d.slice(2, cut)}-${d.slice(cut)}`;
}

/**
 * Lê e confere o formulário do site. Devolve os dados limpos ou os erros por campo (mensagens para mostrar ao lado
 * de cada campo). Unidades e mensagem são opcionais.
 */
export function parseDemoRequest(raw: Record<string, unknown>): { data: DemoRequestInput } | { errors: DemoRequestErrors } {
  const errors: DemoRequestErrors = {};
  const name = clean(raw.name, 120);
  const email = clean(raw.email, 160).toLowerCase();
  const phone = formatPhone(clean(raw.phone, 40));
  const condoName = clean(raw.condoName, 120);
  const unitsRaw = clean(raw.units, 10);
  const units = unitsRaw ? Number(unitsRaw) : null;
  const profile = clean(raw.profile, 20);
  const message = String(raw.message ?? "").trim().slice(0, 1000) || null;

  if (name.length < 3 || !name.includes(" ")) errors.name = "Escreva nome e sobrenome.";
  if (!EMAIL_RE.test(email)) errors.email = "Confira o e-mail.";
  if (!phone) errors.phone = "Informe o WhatsApp com DDD.";
  if (condoName.length < 2) errors.condoName = "Informe o nome do condomínio.";
  if (units !== null && (!Number.isInteger(units) || units < 1 || units > 20000)) errors.units = "Número de unidades inválido.";
  if (!REQUEST_PROFILES.some((p) => p.key === profile)) errors.profile = "Escolha uma opção.";
  if (Object.keys(errors).length) return { errors };
  return { data: { name, email, phone: phone!, condoName, units, profile: profile as RequestProfile, message } };
}
