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

/** Lê o Setting salvo (o que não for e-mail é ignorado). */
export function parseDemoAccounts(raw: string | null | undefined): DemoAccounts {
  try {
    const v = JSON.parse(raw ?? "{}") as Record<string, unknown>;
    return Object.fromEntries(DEMO_SLOTS.flatMap((s) => (typeof v[s.key] === "string" && EMAIL.test(v[s.key] as string) ? [[s.key, v[s.key]]] : []))) as DemoAccounts;
  } catch {
    return {};
  }
}
