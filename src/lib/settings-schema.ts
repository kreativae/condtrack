// Definição dos grupos de configuração (sem valores). Seguro para client e server.

export type FieldType = "text" | "secret" | "number" | "boolean" | "select";

export type FieldDef = {
  key: string;
  label: string;
  type: FieldType;
  hint?: string;
  placeholder?: string;
  options?: { value: string; label: string }[];
  /** Prefixos aceitos (validação leve de chaves). */
  prefixes?: string[];
  /** Variável de ambiente usada como fallback. */
  env?: string;
  default?: string | number | boolean;
  min?: number;
  max?: number;
  /** Só exibe o campo quando outro campo do grupo tem um destes valores. */
  showIf?: { field: string; in: string[] };
};

export type GroupDef = { key: SettingsGroup; title: string; description: string; fields: FieldDef[] };

export type SettingsGroup = "stripe" | "email" | "vercel" | "neon" | "security" | "passkeys";

export const SETTINGS: GroupDef[] = [
  {
    key: "stripe",
    title: "Stripe",
    description: "Cobrança recorrente das assinaturas dos condomínios.",
    fields: [
      { key: "mode", label: "Ambiente", type: "select", options: [{ value: "test", label: "Teste (sandbox)" }, { value: "live", label: "Produção" }], default: "test" },
      { key: "publishableKey", label: "Chave publicável", type: "text", placeholder: "pk_test_…", prefixes: ["pk_test_", "pk_live_"], env: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY" },
      { key: "secretKey", label: "Chave secreta", type: "secret", placeholder: "sk_test_… ou rk_test_…", prefixes: ["sk_test_", "sk_live_", "rk_test_", "rk_live_"], env: "STRIPE_SECRET_KEY", hint: "Stripe Dashboard → Desenvolvedores → Chaves de API. Pode ser uma chave restrita (rk_)." },
      { key: "webhookSecret", label: "Segredo do webhook", type: "secret", placeholder: "whsec_…", prefixes: ["whsec_"], env: "STRIPE_WEBHOOK_SECRET", hint: "Stripe Dashboard → Webhooks → endpoint /api/stripe/webhook → Segredo de assinatura." },
    ],
  },
  {
    key: "email",
    title: "E-mail",
    description: "Envio de notificações, convites de acesso e avisos da plataforma.",
    fields: [
      { key: "enabled", label: "Ativar envio de e-mails", type: "boolean", default: false },
      { key: "provider", label: "Provedor", type: "select", default: "resend", options: [{ value: "resend", label: "Resend (API)" }, { value: "smtp", label: "SMTP (Gmail, Outlook, SES, hospedagem…)" }] },
      { key: "fromName", label: "Nome do remetente", type: "text", default: "Condtrack", placeholder: "Condtrack" },
      { key: "fromEmail", label: "E-mail do remetente", type: "text", placeholder: "nao-responda@seudominio.com.br", env: "EMAIL_FROM", hint: "O domínio precisa estar verificado no provedor." },
      { key: "replyTo", label: "Responder para (opcional)", type: "text", placeholder: "suporte@seudominio.com.br" },
      { key: "resendApiKey", label: "Resend — API key", type: "secret", placeholder: "re_…", prefixes: ["re_"], env: "RESEND_API_KEY", hint: "resend.com → API Keys. Verifique o domínio em Domains.", showIf: { field: "provider", in: ["resend"] } },
      { key: "smtpHost", label: "SMTP — Servidor", type: "text", placeholder: "smtp.gmail.com", env: "SMTP_HOST", showIf: { field: "provider", in: ["smtp"] } },
      { key: "smtpPort", label: "SMTP — Porta", type: "number", default: 587, min: 1, max: 65535, hint: "587 (STARTTLS) ou 465 (SSL).", showIf: { field: "provider", in: ["smtp"] } },
      { key: "smtpUser", label: "SMTP — Usuário", type: "text", placeholder: "usuario@seudominio.com.br", env: "SMTP_USER", showIf: { field: "provider", in: ["smtp"] } },
      { key: "smtpPass", label: "SMTP — Senha", type: "secret", placeholder: "senha ou senha de app", env: "SMTP_PASS", hint: "No Gmail, use uma “senha de app”.", showIf: { field: "provider", in: ["smtp"] } },
      { key: "notifyByEmail", label: "Enviar as notificações do sistema também por e-mail", type: "boolean", default: true, hint: "OS atribuída, validada, aprovada, comunicados, falhas de pagamento…" },
      { key: "sendInvites", label: "Enviar convite com a senha provisória ao cadastrar usuários", type: "boolean", default: true },
    ],
  },
  {
    key: "vercel",
    title: "Vercel",
    description: "Hospedagem: projeto, domínios e histórico de deploys.",
    fields: [
      { key: "token", label: "Access token", type: "secret", placeholder: "Token da conta Vercel", env: "VERCEL_TOKEN", hint: "vercel.com → Account Settings → Tokens → Create. Escopo: o time do projeto." },
      { key: "teamId", label: "Time (ID ou slug)", type: "text", placeholder: "team_… ou kreativae-projetos", env: "VERCEL_TEAM_ID", hint: "Vazio para projetos da conta pessoal." },
      { key: "projectId", label: "Projeto (ID ou nome)", type: "text", placeholder: "prj_… ou condtrack", env: "VERCEL_PROJECT_ID" },
    ],
  },
  {
    key: "neon",
    title: "Neon (banco de dados)",
    description: "Postgres serverless: computes, branches, uso e conexões ativas.",
    fields: [
      { key: "apiKey", label: "API key", type: "secret", placeholder: "napi_…", env: "NEON_API_KEY", hint: "console.neon.tech → Account settings → API keys." },
      { key: "projectId", label: "ID do projeto", type: "text", placeholder: "ex.: billowing-sun-12345678", env: "NEON_PROJECT_ID", hint: "Neon Console → Settings → General → Project ID." },
      { key: "branchId", label: "Branch (opcional)", type: "text", placeholder: "br-… (vazio = branch padrão)" },
      { key: "databaseName", label: "Banco", type: "text", default: "neondb", placeholder: "neondb" },
      { key: "roleName", label: "Role (opcional)", type: "text", placeholder: "neondb_owner", hint: "Usado para ler as conexões ativas (pg_stat_activity). Vazio = dono do banco." },
    ],
  },
  {
    key: "security",
    title: "Segurança",
    description: "Proteção do login e das sessões.",
    fields: [
      { key: "maxLoginAttempts", label: "Tentativas de login antes do bloqueio", type: "number", default: 5, min: 3, max: 20 },
      { key: "lockMinutes", label: "Tempo de bloqueio (minutos)", type: "number", default: 15, min: 1, max: 1440 },
      { key: "sessionHours", label: "Duração da sessão (horas)", type: "number", default: 12, min: 1, max: 720, hint: "Vale para novos logins." },
      { key: "turnstileEnabled", label: "Ativar Cloudflare Turnstile no login", type: "boolean", default: false, hint: "Verificação anti-robô invisível, gratuita. Requer as chaves abaixo." },
      { key: "turnstileSiteKey", label: "Turnstile — Site key", type: "text", placeholder: "0x4AAAAAAA…", env: "TURNSTILE_SITE_KEY" },
      { key: "turnstileSecretKey", label: "Turnstile — Secret key", type: "secret", placeholder: "0x4AAAAAAA…", env: "TURNSTILE_SECRET_KEY", hint: "Cloudflare Dashboard → Turnstile → Adicionar site." },
    ],
  },
  {
    key: "passkeys",
    title: "Face ID e biometria",
    description: "Passkeys (WebAuthn): Face ID e Touch ID no iPhone/Mac, digital no Android, Windows Hello.",
    fields: [
      { key: "enabled", label: "Permitir login com Face ID / biometria", type: "boolean", default: true },
      { key: "rpName", label: "Nome exibido no aparelho", type: "text", default: "Condtrack", placeholder: "Condtrack" },
      { key: "rpId", label: "Domínio (RP ID)", type: "text", placeholder: "condtrack.app", hint: "Domínio onde o sistema roda, sem https:// (ex.: app.condtrack.com.br). Vazio = domínio atual. Passkeys ficam presas a este domínio." },
      { key: "allowedOrigins", label: "Origens permitidas", type: "text", placeholder: "https://app.condtrack.com.br", hint: "Separe por vírgula. Vazio = origem atual." },
    ],
  },
];

export function groupDef(key: SettingsGroup) {
  return SETTINGS.find((g) => g.key === key)!;
}
