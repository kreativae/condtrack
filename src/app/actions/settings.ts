"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getSettings, saveSettings, type SettingsValues } from "@/lib/settings";
import { groupDef, type SettingsGroup } from "@/lib/settings-schema";
import { stripeWithKey } from "@/lib/stripe";
import { emailConfig, renderEmail, sendEmail } from "@/lib/email";
import { appUrl } from "@/lib/url";
import { vercelConfig, vercelTest } from "@/lib/vercel";
import { neonConfig, neonTest } from "@/lib/neon";

export type SettingsState = { error?: string; ok?: boolean; message?: string } | undefined;

/** Converte o formulário em valores do grupo (com validação por campo). */
function parseGroup(group: SettingsGroup, form: FormData): { patch: SettingsValues } | { error: string } {
  const def = groupDef(group);
  const patch: SettingsValues = {};

  for (const f of def.fields) {
    const raw = form.get(f.key);
    if (f.type === "boolean") {
      patch[f.key] = raw === "on";
      continue;
    }
    if (f.type === "secret") {
      // Campo vazio = manter o valor atual; "remover" limpa
      if (form.get(`clear_${f.key}`) === "on") patch[f.key] = undefined;
      else if (typeof raw === "string" && raw.trim()) patch[f.key] = raw.trim();
      else continue;
    } else {
      const v = String(raw ?? "").trim();
      if (f.type === "number") {
        if (!v) {
          patch[f.key] = undefined;
          continue;
        }
        const n = Number(v);
        if (!Number.isFinite(n) || (f.min != null && n < f.min) || (f.max != null && n > f.max)) return { error: `${f.label}: informe um valor entre ${f.min} e ${f.max}.` };
        patch[f.key] = n;
        continue;
      }
      if (f.type === "select" && v && !f.options?.some((o) => o.value === v)) return { error: `${f.label}: opção inválida.` };
      patch[f.key] = v || undefined;
    }
    const val = patch[f.key];
    if (typeof val === "string" && f.prefixes && !f.prefixes.some((p) => val.startsWith(p))) {
      return { error: `${f.label}: deve começar com ${f.prefixes.join(" ou ")}.` };
    }
  }
  return { patch };
}

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

export async function saveSettingsGroup(group: SettingsGroup, _prev: SettingsState, form: FormData): Promise<SettingsState> {
  const user = await requireUser("superadmin");
  const def = groupDef(group);
  const parsed = parseGroup(group, form);
  if ("error" in parsed) return { error: parsed.error };
  const { patch } = parsed;

  // Coerência do Stripe: ambiente × prefixo das chaves
  if (group === "stripe") {
    const merged = { ...(await getSettings("stripe")), ...patch };
    const live = merged.mode === "live";
    for (const k of ["publishableKey", "secretKey"] as const) {
      const v = String(merged[k] ?? "");
      if (v && v.includes(live ? "_test_" : "_live_")) return { error: `A ${k === "secretKey" ? "chave secreta" : "chave publicável"} é de ${live ? "teste" : "produção"}, mas o ambiente escolhido é ${live ? "Produção" : "Teste"}.` };
    }
  }
  if (group === "security" && patch.turnstileEnabled) {
    const merged = { ...(await getSettings("security")), ...patch };
    if (!merged.turnstileSiteKey || !merged.turnstileSecretKey) return { error: "Para ativar o Turnstile, informe a Site key e a Secret key." };
  }
  if (group === "email") {
    for (const k of ["fromEmail", "replyTo"] as const) {
      if (typeof patch[k] === "string" && !EMAIL_RE.test(String(patch[k]))) return { error: `${k === "fromEmail" ? "E-mail do remetente" : "Responder para"}: e-mail inválido.` };
    }
    if (patch.enabled) {
      const c = await emailConfig(patch);
      if (!c.ready) {
        const missing = [!c.fromEmail && "e-mail do remetente", ...(c.provider === "resend" ? [!c.resendApiKey && "API key do Resend"] : [!c.smtpHost && "servidor SMTP", !c.smtpUser && "usuário SMTP", !c.smtpPass && "senha SMTP"])].filter(Boolean);
        return { error: `Para ativar o envio, preencha: ${missing.join(", ")}.` };
      }
    }
  }
  if (group === "passkeys" && typeof patch.rpId === "string" && /[/:]/.test(patch.rpId)) {
    return { error: "Domínio (RP ID): informe só o domínio, sem https:// nem porta." };
  }

  await saveSettings(group, patch, user.id);
  // Auditoria sem valores secretos
  await audit(user, "settings_updated", "settings", group, {
    new: Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, def.fields.find((f) => f.key === k)?.type === "secret" ? (v ? "(alterado)" : "(removido)") : v])),
  });
  revalidatePath("/admin/configuracoes");
  return { ok: true, message: "Configurações salvas." };
}

export async function testStripeConnection(_prev: SettingsState, form: FormData): Promise<SettingsState> {
  await requireUser("superadmin");
  const typed = String(form.get("secretKey") ?? "").trim();
  const key = typed || String((await getSettings("stripe")).secretKey ?? "");
  if (!key) return { error: "Informe a chave secreta para testar." };
  const s = stripeWithKey(key);
  try {
    const balance = await s.balance.retrieve();
    const account = await s.accounts.retrieveCurrent().catch(() => null);
    const name = account?.settings?.dashboard?.display_name || account?.business_profile?.name || account?.email;
    const currency = balance.available[0]?.currency?.toUpperCase();
    return { ok: true, message: `Conectado${name ? ` à conta “${name}”` : ""} — modo ${balance.livemode ? "produção" : "teste"}${currency ? `, moeda ${currency}` : ""}.` };
  } catch (e) {
    const err = e as { type?: string; message?: string };
    if (err.type === "StripeAuthenticationError") return { error: "Chave inválida ou revogada. Confira no Stripe Dashboard → Chaves de API." };
    if (err.type === "StripePermissionError") return { error: "A chave restrita não tem permissão de leitura de saldo (Balance: Read)." };
    return { error: `Falha na conexão: ${err.message ?? String(e)}` };
  }
}

export async function sendTestEmail(_prev: SettingsState, form: FormData): Promise<SettingsState> {
  const user = await requireUser("superadmin");
  const parsed = parseGroup("email", form);
  if ("error" in parsed) return { error: parsed.error };
  // Usa o que está no formulário (mesmo sem salvar) sobre o que já está salvo
  const overrides = Object.fromEntries(Object.entries(parsed.patch).filter(([, v]) => v !== undefined && v !== ""));
  const c = await emailConfig(overrides);
  if (!c.ready) return { error: "Preencha remetente e as credenciais do provedor para testar." };
  const to = String(form.get("testTo") ?? "").trim() || user.email;
  if (!EMAIL_RE.test(to)) return { error: "Destinatário do teste inválido." };
  const { html, text } = renderEmail({
    title: "E-mail de teste do Condtrack",
    intro: `Olá, ${user.name.split(" ")[0]}! Se você recebeu esta mensagem, o envio de e-mails está funcionando.`,
    lines: [`Provedor: ${c.provider === "resend" ? "Resend" : `SMTP (${c.smtpHost}:${c.smtpPort})`}`, `Remetente: ${c.fromName} <${c.fromEmail}>`],
    cta: { label: "Abrir o Condtrack", url: `${await appUrl()}/dashboard` },
  });
  const res = await sendEmail({ to, subject: "Teste de e-mail — Condtrack", html, text }, c, "test");
  await audit(user, res.ok ? "email_test_sent" : "email_test_failed", "settings", "email", { new: { to, provider: c.provider, error: res.ok ? undefined : res.error } });
  return res.ok ? { ok: true, message: `E-mail de teste enviado para ${to}.` } : { error: `Falha no envio: ${res.error}` };
}

/** Valores do formulário sobre os salvos (para testar antes de salvar). */
function formOverrides(group: SettingsGroup, form: FormData) {
  const parsed = parseGroup(group, form);
  if ("error" in parsed) return parsed;
  return { overrides: Object.fromEntries(Object.entries(parsed.patch).filter(([, v]) => v !== undefined && v !== "")) };
}

export async function testVercelConnection(_prev: SettingsState, form: FormData): Promise<SettingsState> {
  await requireUser("superadmin");
  const o = formOverrides("vercel", form);
  if ("error" in o) return { error: o.error };
  const c = await vercelConfig(o.overrides);
  if (!c.token) return { error: "Informe o access token." };
  try {
    const r = await vercelTest(c);
    return { ok: true, message: `Conectado como ${r.user}${r.project ? ` — projeto “${r.project}” encontrado` : " (informe o projeto)"}.` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function testNeonConnection(_prev: SettingsState, form: FormData): Promise<SettingsState> {
  await requireUser("superadmin");
  const o = formOverrides("neon", form);
  if ("error" in o) return { error: o.error };
  const c = await neonConfig(o.overrides);
  if (!c.ready) return { error: "Informe a API key e o ID do projeto." };
  try {
    const r = await neonTest(c);
    return { ok: true, message: `Conectado ao projeto “${r.name}” (${r.region}, Postgres ${r.pg}).` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
