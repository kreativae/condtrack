"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { emailConfig, renderEmail, sendEmail } from "@/lib/email";
import { appUrl } from "@/lib/url";
import { fill, sampleVars, templateDef, templateDefaults, usedVars, type TemplateValues } from "@/lib/messages";
import { MESSAGES_SETTING_KEY, clearTemplateCache, getAllTemplates, getTemplateOverrides } from "@/lib/messages-server";

export type MessageState = { error?: string; ok?: boolean; message?: string } | undefined;

/** Valida os valores enviados pelo editor para um modelo. */
function parse(key: string, form: FormData): { values: TemplateValues } | { error: string } {
  const t = templateDef(key);
  if (!t) return { error: "Modelo desconhecido." };
  let input: Record<string, unknown>;
  try {
    input = JSON.parse(String(form.get("data") ?? "{}"));
  } catch {
    return { error: "Dados inválidos." };
  }
  const known = new Set(t.vars.map((v) => v.name));
  const values: TemplateValues = {};
  for (const f of t.fields) {
    const v = typeof input[f.key] === "string" ? (input[f.key] as string).trim() : "";
    if (!v) return { error: `${f.label}: não pode ficar vazio.` };
    if (v.length > (f.kind === "text" ? 200 : 2000)) return { error: `${f.label}: texto longo demais.` };
    const unknown = usedVars(v).filter((n) => !known.has(n));
    if (unknown.length) return { error: `${f.label}: variável desconhecida {${unknown[0]}}. Use apenas as da lista.` };
    values[f.key] = v;
  }
  for (const r of t.required ?? []) {
    if (!t.fields.some((f) => usedVars(String(values[f.key])).includes(r))) return { error: `A variável {${r}} é obrigatória nesta mensagem — sem ela a pessoa não recebe a informação.` };
  }
  for (const c of t.channels) values[c] = input[c] === true;
  return { values };
}

async function store(data: Record<string, TemplateValues>, userId: string) {
  await db.setting.upsert({
    where: { key: MESSAGES_SETTING_KEY },
    create: { key: MESSAGES_SETTING_KEY, value: JSON.stringify(data), updatedById: userId },
    update: { value: JSON.stringify(data), updatedById: userId },
  });
  clearTemplateCache();
  revalidatePath("/admin/configuracoes");
}

export async function saveTemplate(key: string, _prev: MessageState, form: FormData): Promise<MessageState> {
  const user = await requireUser("superadmin");
  const parsed = parse(key, form);
  if ("error" in parsed) return { error: parsed.error };
  const all = { ...(await getTemplateOverrides()) };
  all[key] = parsed.values;
  await store(all, user.id);
  await audit(user, "settings_updated", "message_template", key, { new: parsed.values });
  return { ok: true, message: "Mensagem salva." };
}

export async function resetTemplate(key: string, _prev: MessageState): Promise<MessageState> {
  const user = await requireUser("superadmin");
  if (!templateDef(key)) return { error: "Modelo desconhecido." };
  const all = { ...(await getTemplateOverrides()) };
  delete all[key];
  await store(all, user.id);
  await audit(user, "settings_updated", "message_template", key, { new: { reset: true } });
  return { ok: true, message: "Texto padrão restaurado." };
}

/** Envia o modelo (com os valores do editor, mesmo sem salvar) para o e-mail do superadmin. */
export async function sendTemplateTest(key: string, _prev: MessageState, form: FormData): Promise<MessageState> {
  const user = await requireUser("superadmin");
  const parsed = parse(key, form);
  if ("error" in parsed) return { error: parsed.error };
  const cfg = await emailConfig();
  if (!cfg.ready) return { error: "Configure o envio em Configurações → E-mail antes de testar." };

  const t = templateDef(key)!;
  const all = await getAllTemplates();
  // Editando o layout: aplica os valores do editor a uma notificação de exemplo
  const layoutValues = key === "email_layout" ? parsed.values : all.email_layout;
  const sampleKey = key === "email_layout" ? "os_assigned" : key;
  const sample = templateDef(sampleKey)!;
  const v = key === "email_layout" ? { ...templateDefaults(sample), ...all[sampleKey] } : parsed.values;
  const vars = { ...sampleVars(sample), nome: user.name.split(" ")[0] };
  const f = (k: string, src: TemplateValues = v) => fill(String(src[k] ?? ""), vars);
  const base = await appUrl();
  const access = t.group === "Acesso";
  const { html, text } = renderEmail({
    title: f("title"),
    intro: access ? undefined : f("greeting", layoutValues),
    lines: f("message").split("\n"),
    cta: { label: access ? f("cta") : f("ctaOrder", layoutValues), url: `${base}${access ? "/login" : "/notificacoes"}` },
    footnote: access ? f("footnote") : f("footnote", layoutValues),
    footer: f("footer", layoutValues),
  });
  const subject = `[Teste] ${access ? f("subject") : f("title")}`;
  const res = await sendEmail({ to: user.email, subject, html, text }, cfg, "test");
  if (!res.ok) return { error: `Falha no envio: ${res.error}` };
  return { ok: true, message: `Enviado para ${user.email}.` };
}

/** Remove uma notificação do sino de quem a recebeu (Histórico). */
export async function deleteNotification(id: string): Promise<MessageState> {
  const user = await requireUser("superadmin");
  const n = await db.notification.findUnique({ where: { id } });
  if (!n) return { error: "Notificação não encontrada." };
  await db.notification.delete({ where: { id } });
  await audit(user, "delete", "notification", id, { old: { userId: n.userId, type: n.type, title: n.title } });
  revalidatePath("/admin/configuracoes");
  return { ok: true };
}
