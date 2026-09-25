import "server-only";
import { db } from "./db";
import { TEMPLATES, fill, templateDef, templateDefaults, type TemplateValues } from "./messages";

// Textos personalizados (JSON puro — não há segredos) por chave de modelo.
export const MESSAGES_SETTING_KEY = "message_templates";

let cache: { at: number; data: Record<string, TemplateValues> } | null = null;

export async function getTemplateOverrides(): Promise<Record<string, TemplateValues>> {
  if (cache && Date.now() - cache.at < 15_000) return cache.data;
  const row = await db.setting.findUnique({ where: { key: MESSAGES_SETTING_KEY } }).catch(() => null);
  let data: Record<string, TemplateValues> = {};
  try {
    data = row ? JSON.parse(row.value) : {};
  } catch {}
  cache = { at: Date.now(), data };
  return data;
}

export function clearTemplateCache() {
  cache = null;
}

/** Valores efetivos de todos os modelos: padrão + personalizado. */
export async function getAllTemplates(): Promise<Record<string, TemplateValues>> {
  const saved = await getTemplateOverrides();
  return Object.fromEntries(TEMPLATES.map((t) => [t.key, { ...templateDefaults(t), ...(saved[t.key] ?? {}) }]));
}

/** Modelo com as variáveis preenchidas. Campos de texto viram string; canais, boolean. */
export async function renderTemplate(key: string, vars: Record<string, string | number | null | undefined>) {
  const t = templateDef(key);
  if (!t) throw new Error(`Modelo de mensagem desconhecido: ${key}`);
  const v = { ...templateDefaults(t), ...((await getTemplateOverrides())[key] ?? {}) };
  const text = (k: string) => fill(String(v[k] ?? ""), vars);
  return {
    get: text,
    title: text("title"),
    message: text("message"),
    app: t.channels.includes("app") ? v.app !== false : false,
    email: t.channels.includes("email") ? v.email !== false : true,
  };
}
