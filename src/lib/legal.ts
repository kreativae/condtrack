import "server-only";
import { cache } from "react";
import { db } from "./db";
import { getSettings } from "./settings";
import { DEFAULT_LEGAL_TEXTS, LEGAL_TEXTS_KEY, cleanMessages, cleanSections, fillVars, type LegalTexts, type Section } from "./legal-texts";

// Termos de Uso e Política de Privacidade (LGPD). Dados da empresa em Configurações → Dados legais.
// Textos editáveis logo abaixo, na mesma aba (padrões em lib/legal-texts.ts). O modelo inicial deve ser revisado por um advogado antes do uso comercial.

export type Legal = { companyName: string; cnpj: string; address: string; dpoName: string; dpoEmail: string; forum: string; version: string };

const MISSING = (what: string) => `[${what}]`;

export async function getLegal(): Promise<Legal> {
  const v = await getSettings("legal");
  const str = (k: string, fallback: string) => (typeof v[k] === "string" && (v[k] as string).trim()) || fallback;
  return {
    companyName: str("companyName", MISSING("razão social")),
    cnpj: str("cnpj", MISSING("CNPJ")),
    address: str("address", MISSING("endereço")),
    dpoName: str("dpoName", MISSING("nome do encarregado")),
    dpoEmail: str("dpoEmail", MISSING("e-mail do encarregado")),
    forum: str("forum", MISSING("comarca")),
    version: str("version", "2026-10-03"),
  };
}

/**
 * Versão vigente dos termos (quem aceitou outra versão aceita de novo). null enquanto a razão social e o
 * e-mail do encarregado não forem preenchidos em Configurações: sem eles, o aceite não é pedido.
 */
export async function termsVersion() {
  const v = await getSettings("legal");
  const filled = (k: string) => typeof v[k] === "string" && (v[k] as string).trim() !== "";
  if (!filled("companyName") || !filled("dpoEmail")) return null;
  return (await getLegal()).version;
}

export const fmtVersion = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v.split("-").reverse().join("/") : v);

export type { Section };

/** Textos salvos em Configurações; o que não foi personalizado usa o padrão. */
export const getLegalTexts = cache(async (): Promise<LegalTexts> => {
  const row = await db.setting.findUnique({ where: { key: LEGAL_TEXTS_KEY } }).catch(() => null);
  let saved: Record<string, unknown> = {};
  try {
    saved = row ? JSON.parse(row.value) : {};
  } catch {}
  return {
    terms: cleanSections(saved.terms) ?? DEFAULT_LEGAL_TEXTS.terms,
    privacy: cleanSections(saved.privacy) ?? DEFAULT_LEGAL_TEXTS.privacy,
    messages: { ...DEFAULT_LEGAL_TEXTS.messages, ...cleanMessages(saved.messages) },
  };
});

export function legalVars(l: Legal): Record<string, string> {
  return { empresa: l.companyName, cnpj: l.cnpj, endereco: l.address, encarregado: l.dpoName, email_encarregado: l.dpoEmail, foro: l.forum };
}

/** Documento com as variáveis preenchidas pelos dados legais. */
export async function legalDocument(doc: "terms" | "privacy") {
  const [l, t] = await Promise.all([getLegal(), getLegalTexts()]);
  const vars = legalVars(l);
  return { legal: l, sections: t[doc].map((s) => ({ title: fillVars(s.title, vars), body: s.body.map((p) => fillVars(p, vars)) })) };
}

/** Mensagens da LGPD com as variáveis preenchidas (extras: {nome}, {data}…). */
export async function legalMessages(extra: Record<string, string> = {}) {
  const [l, t] = await Promise.all([getLegal(), getLegalTexts()]);
  const vars = { ...legalVars(l), ...extra };
  return Object.fromEntries(Object.entries(t.messages).map(([k, v]) => [k, fillVars(v, vars)])) as LegalTexts["messages"];
}
