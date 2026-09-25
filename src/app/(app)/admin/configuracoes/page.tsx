import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CreditCard, Database, LogIn, Mail, MessagesSquare, ScanFace, ShieldCheck, Triangle } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings, maskSecret, settingsSource } from "@/lib/settings";
import { SETTINGS, type SettingsGroup } from "@/lib/settings-schema";
import { passkeyConfig } from "@/lib/passkeys";
import { appUrl } from "@/lib/billing";
import { emailConfig } from "@/lib/email";
import { vercelConfig } from "@/lib/vercel";
import { neonConfig } from "@/lib/neon";
import { VercelPanel } from "@/components/integrations/vercel-panel";
import { NeonPanel } from "@/components/integrations/neon-panel";
import { Badge, Card, CardHeader, PageHeader, cx } from "@/components/ui";
import { CopyField, SettingsForm, type ClientField } from "./settings-form";
import { LoginAppearanceForm } from "./login-appearance-form";
import { getLoginAppearance } from "@/lib/login-appearance-server";
import { MessagesEditor } from "./messages-editor";
import { MessagesHistory } from "./messages-history";
import { getAllTemplates, getTemplateOverrides } from "@/lib/messages-server";

export const metadata: Metadata = { title: "Configurações" };

const ICON = { stripe: CreditCard, email: Mail, vercel: Triangle, neon: Database, security: ShieldCheck, passkeys: ScanFace, login: LogIn, mensagens: MessagesSquare } as const;
const STRIPE_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.trial_will_end",
  "invoice.finalized",
  "invoice.paid",
  "invoice.payment_failed",
  "invoice.voided",
  "invoice.marked_uncollectible",
];

export default async function SettingsPage({ searchParams }: PageProps<"/admin/configuracoes">) {
  const me = await requireUser("superadmin");
  const sp = await searchParams;
  const { aba } = sp;
  // "login" é uma aba própria (editor visual), fora dos grupos de integração
  if (aba === "login") {
    const [a, pk] = await Promise.all([getLoginAppearance(), passkeyConfig()]);
    return (
      <SettingsShell current="login">
        <LoginAppearanceForm initial={a} passkeys={pk.enabled} />
      </SettingsShell>
    );
  }
  // "mensagens": modelos das mensagens automáticas + histórico do que foi enviado
  if (aba === "mensagens") {
    const historico = sp.sub === "historico";
    const [values, overrides, cfg] = await Promise.all([getAllTemplates(), getTemplateOverrides(), emailConfig()]);
    return (
      <SettingsShell current="mensagens">
        <div className="min-w-0 space-y-6">
          <nav className="flex gap-1 border-b border-line">
            {([["modelos", "Modelos"], ["historico", "Histórico de envios"]] as const).map(([k, l]) => (
              <Link
                key={k}
                href={`/admin/configuracoes?aba=mensagens${k === "historico" ? "&sub=historico" : ""}`}
                className={cx("-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition", (k === "historico") === historico ? "border-brand text-brand" : "border-transparent text-muted hover:text-fg")}
              >
                {l}
              </Link>
            ))}
          </nav>
          {historico ? (
            <MessagesHistory sp={sp} />
          ) : (
            <>
              <p className="text-sm text-muted">Textos das notificações e e-mails enviados automaticamente. Ligue ou desligue cada canal, edite os textos com variáveis e veja a prévia antes de salvar.</p>
              <MessagesEditor values={values} customized={Object.keys(overrides)} emailReady={cfg.ready} adminEmail={me.email} />
            </>
          )}
        </div>
      </SettingsShell>
    );
  }
  const current = (SETTINGS.find((g) => g.key === aba)?.key ?? "stripe") as SettingsGroup;
  const def = SETTINGS.find((g) => g.key === current)!;

  const [values, sources, statusAll] = await Promise.all([
    getSettings(current),
    settingsSource(current),
    Promise.all(SETTINGS.map(async (g) => [g.key, await getSettings(g.key)] as const)),
  ]);
  const status = Object.fromEntries(statusAll) as Record<SettingsGroup, Record<string, unknown>>;
  const configured: Record<SettingsGroup, boolean> = {
    stripe: !!status.stripe.secretKey,
    email: (await emailConfig()).active,
    vercel: (await vercelConfig()).ready,
    neon: (await neonConfig()).ready,
    security: true,
    passkeys: status.passkeys.enabled !== false,
  };

  const fields: ClientField[] = def.fields.map((f) => ({
    ...f,
    value: f.type === "secret" ? null : ((values[f.key] ?? null) as ClientField["value"]),
    masked: f.type === "secret" ? maskSecret(values[f.key]) : undefined,
    source: sources[f.key],
  }));

  const base = await appUrl();
  const [pk, passkeyCount, passkeyUsers] = await Promise.all([
    passkeyConfig(),
    db.passkey.count(),
    db.passkey.groupBy({ by: ["userId"] }).then((r) => r.length),
  ]);

  return (
    <SettingsShell current={current} configured={configured}>
        <div className="space-y-6">
          <Card>
            <CardHeader title={def.title} subtitle={def.description} action={configured[current] ? <Badge tone="ok" dot>Ativo</Badge> : <Badge tone="muted" dot>Não configurado</Badge>} />
            <div className="p-5 sm:p-6"><SettingsForm key={current} group={current} fields={fields} adminEmail={me.email} /></div>
          </Card>

          {current === "vercel" && (
            <Suspense fallback={<PanelSkeleton label="Consultando a Vercel…" />}>
              <VercelPanel />
            </Suspense>
          )}
          {current === "neon" && (
            <Suspense fallback={<PanelSkeleton label="Consultando o Neon e o banco…" />}>
              <NeonPanel />
            </Suspense>
          )}

          {current === "stripe" && (
            <Card>
              <CardHeader title="Webhook" subtitle="Cadastre este endpoint no Stripe (Desenvolvedores → Webhooks) para receber renovações e falhas de pagamento." />
              <div className="space-y-4 p-5 sm:p-6">
                <CopyField value={`${base}/api/stripe/webhook`} />
                <div>
                  <p className="mb-2 text-[13px] font-medium text-fg-2">Eventos a selecionar</p>
                  <div className="flex flex-wrap gap-1.5">{STRIPE_EVENTS.map((e) => <code key={e} className="rounded-md bg-bg-2 px-2 py-1 text-[11px]">{e}</code>)}</div>
                </div>
                <p className="text-xs text-muted">Em desenvolvimento local, use <code className="rounded bg-bg-2 px-1">stripe listen --forward-to localhost:3000/api/stripe/webhook</code> e cole o segredo exibido no campo “Segredo do webhook”.</p>
              </div>
            </Card>
          )}

          {current === "passkeys" && (
            <Card>
              <CardHeader title="Status" />
              <dl className="grid gap-4 p-5 text-sm sm:grid-cols-3 sm:p-6">
                <div><dt className="text-xs text-muted">Domínio em uso (RP ID)</dt><dd className="mt-1 font-mono">{pk.rpID}</dd></div>
                <div><dt className="text-xs text-muted">Origens aceitas</dt><dd className="mt-1 break-all font-mono text-xs">{pk.origins.join(", ")}</dd></div>
                <div><dt className="text-xs text-muted">Aparelhos cadastrados</dt><dd className="mt-1">{passkeyCount} ({passkeyUsers} usuário(s))</dd></div>
              </dl>
              <p className="border-t border-line px-5 py-4 text-xs text-muted sm:px-6">Cada usuário ativa a biometria em <b>Meu perfil → Face ID / biometria</b>. Face ID exige HTTPS em produção (localhost funciona em desenvolvimento). Trocar o domínio invalida os aparelhos já cadastrados.</p>
            </Card>
          )}

          {current === "security" && (
            <Card>
              <CardHeader title="Proteções sempre ativas" />
              <ul className="space-y-2 p-5 text-sm text-fg-2 sm:p-6">
                <li>• Senhas com hash bcrypt; sessão em cookie httpOnly assinado (JWT).</li>
                <li>• Bloqueio temporário após tentativas de login incorretas (configurável acima).</li>
                <li>• Cabeçalhos de segurança (HSTS, X-Frame-Options, nosniff, Referrer-Policy).</li>
                <li>• Auditoria de ações críticas com IP e navegador.</li>
                <li>• Chaves de API cifradas com AES-256-GCM no banco.</li>
              </ul>
            </Card>
          )}
        </div>
    </SettingsShell>
  );
}

/** Cabeçalho + menu lateral das abas de Configurações. */
function SettingsShell({ current, configured, children }: { current: SettingsGroup | "login" | "mensagens"; configured?: Partial<Record<SettingsGroup, boolean>>; children: React.ReactNode }) {
  const tabs = [
    ...SETTINGS.map((g) => ({ key: g.key as SettingsGroup | "login" | "mensagens", title: g.title })),
    { key: "login" as const, title: "Página de login" },
    { key: "mensagens" as const, title: "Mensagens" },
  ];
  return (
    <div className="animate-in">
      <PageHeader eyebrow="Superadministração" title="Configurações" description="Integrações, APIs e aparência da plataforma. Chaves secretas são guardadas criptografadas e nunca exibidas por completo." />

      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <nav className="flex gap-1 self-start overflow-x-auto lg:sticky lg:top-[calc(4rem+var(--chrome,0rem)+0.75rem)] lg:flex-col">
          {tabs.map((g) => {
            const Icon = ICON[g.key];
            const ok = g.key === "login" || g.key === "mensagens" ? undefined : configured?.[g.key];
            return (
              <Link
                key={g.key}
                href={`/admin/configuracoes?aba=${g.key}`}
                className={cx("flex items-center gap-3 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-medium transition", current === g.key ? "bg-brand-soft text-brand" : "text-fg-2 hover:bg-bg-2")}
              >
                <Icon className="size-4" />
                <span className="flex-1">{g.title}</span>
                {ok !== undefined && <span className={cx("size-2 rounded-full", ok ? "bg-ok" : "bg-muted/40")} title={ok ? "Configurado" : "Não configurado"} />}
              </Link>
            );
          })}
          <p className="hidden px-3 pt-4 text-xs text-muted lg:block">Novas integrações (SMS, WhatsApp, armazenamento) entrarão aqui.</p>
        </nav>
        {children}
      </div>
    </div>
  );
}

function PanelSkeleton({ label }: { label: string }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{label}</p>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-28 animate-pulse rounded-2xl border border-line bg-surface" />
      ))}
    </div>
  );
}
