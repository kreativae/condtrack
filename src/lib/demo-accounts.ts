// Contas reais usadas no condomínio de demonstração (no lugar das pessoas fictícias). Seguro para client e server.

export const DEMO_SLOTS = [
  { key: "syndic", label: "Síndico", role: "syndic" },
  { key: "caretaker", label: "Zelador", role: "caretaker" },
  { key: "doorman", label: "Porteiro", role: "doorman" },
  { key: "council", label: "Conselho", role: "council" },
  { key: "resident", label: "Morador", role: "resident" },
  { key: "provider", label: "Prestador", role: "provider" },
] as const;
export type DemoSlot = (typeof DEMO_SLOTS)[number]["key"];
export type DemoAccounts = Partial<Record<DemoSlot, string>>;

/** Contas de teste usadas por padrão. As que não existirem são criadas com DEMO_PASSWORD. */
export const DEMO_DEFAULT_ACCOUNTS: DemoAccounts = {
  syndic: "sindico@condtrack.app",
  caretaker: "zelador@condtrack.app",
  doorman: "porteiro@condtrack.app",
  council: "conselho@condtrack.app",
  resident: "morador@condtrack.app",
  provider: "prestador@condtrack.app",
};
export const DEMO_PASSWORD = "condtrack123";

/** Setting com os e-mails da última demonstração (só e-mails, JSON puro; só o superadmin lê). */
export const DEMO_ACCOUNTS_KEY = "demo_accounts";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Limpa os e-mails digitados: minúsculas, sem vazios; o síndico é obrigatório e o mesmo e-mail não vale para dois perfis. */
export function normalizeDemoAccounts(input: Partial<Record<string, unknown>>): { accounts: DemoAccounts; error?: string } {
  const accounts: DemoAccounts = {};
  const seen = new Map<string, string>();
  for (const s of DEMO_SLOTS) {
    const v = typeof input[s.key] === "string" ? (input[s.key] as string).trim().toLowerCase() : "";
    if (!v) continue;
    if (!EMAIL.test(v)) return { accounts, error: `E-mail inválido em ${s.label}.` };
    if (seen.has(v)) return { accounts, error: `${v} está em ${seen.get(v)} e em ${s.label}: use uma conta por perfil.` };
    seen.set(v, s.label);
    accounts[s.key] = v;
  }
  if (!accounts.syndic) return { accounts, error: "Informe o e-mail do síndico." };
  return { accounts };
}

/** Lê o Setting salvo (o que não for e-mail é ignorado); perfil sem e-mail salvo volta com a conta de teste padrão. */
export function parseDemoAccounts(raw: string | null | undefined): DemoAccounts {
  let v: Record<string, unknown> = {};
  try {
    v = JSON.parse(raw ?? "{}") as Record<string, unknown>;
  } catch {}
  return Object.fromEntries(DEMO_SLOTS.map((s) => [s.key, typeof v[s.key] === "string" && EMAIL.test(v[s.key] as string) ? v[s.key] : DEMO_DEFAULT_ACCOUNTS[s.key]])) as DemoAccounts;
}

/**
 * Demonstração externa (para testes de outras pessoas): contas numeradas, uma série nova a cada condomínio
 * (sindico1@, zelador1@… depois sindico2@, zelador2@…), para uma demonstração não mexer na outra.
 */
export const DEMO_EXTERNAL_DOMAIN = "condtrack.app";
const EXTERNAL_PREFIX: Record<DemoSlot, string> = {
  syndic: "sindico",
  caretaker: "zelador",
  doorman: "porteiro",
  council: "conselho",
  resident: "morador",
  provider: "prestador",
};
const EXTERNAL_RE = new RegExp(`^(${Object.values(EXTERNAL_PREFIX).join("|")})(\\d+)@${DEMO_EXTERNAL_DOMAIN.replace(".", "\\.")}$`);

export function externalDemoAccounts(n: number): DemoAccounts {
  return Object.fromEntries(DEMO_SLOTS.map((s) => [s.key, `${EXTERNAL_PREFIX[s.key]}${n}@${DEMO_EXTERNAL_DOMAIN}`])) as DemoAccounts;
}

/** Próximo número livre: o menor cuja série inteira ainda não existe (as contas das séries antigas ficam). */
export function nextExternalNumber(emails: string[]) {
  const used = new Set<number>();
  for (const e of emails) {
    const m = EXTERNAL_RE.exec(e.toLowerCase());
    if (m) used.add(Number(m[2]));
  }
  let n = 1;
  while (used.has(n)) n++;
  return n;
}

/** Filtro para buscar no banco os e-mails das séries externas (o número exato sai de nextExternalNumber). */
export const externalEmailFilter = () => ({ OR: Object.values(EXTERNAL_PREFIX).map((p) => ({ email: { startsWith: p, endsWith: `@${DEMO_EXTERNAL_DOMAIN}` } })) });
