"use client";

import { startTransition, useActionState, useMemo, useRef, useState, type FormEvent } from "react";
import { Bell, ChevronDown, Mail, RotateCcw, Send } from "lucide-react";
import { resetTemplate, saveTemplate, sendTemplateTest, type MessageState } from "@/app/actions/messages";
import { TEMPLATES, fill, sampleVars, templateDefaults, templateDef, type TemplateDef, type TemplateValues } from "@/lib/messages";
import { renderEmail } from "@/lib/email-render";
import { Alert, Badge, Card, Field, Input, Textarea, buttonClass, cx } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

type Intent = "save" | "test" | "reset";
type Props = { values: Record<string, TemplateValues>; customized: string[]; emailReady: boolean; adminEmail: string };

/** Lista de mensagens automáticas agrupadas; uma aberta por vez. */
export function MessagesEditor({ values, customized, emailReady, adminEmail }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const groups = useMemo(() => [...new Set(TEMPLATES.map((t) => t.group))], []);
  return (
    <div className="space-y-6">
      {!emailReady && (
        <Alert tone="warn">O envio de e-mails ainda não está configurado (Configurações → E-mail). As notificações no app funcionam normalmente.</Alert>
      )}
      {groups.map((g) => (
        <Card key={g} className="overflow-hidden">
          <p className="border-b border-line px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted">{g}</p>
          <ul className="divide-y divide-line">
            {TEMPLATES.filter((t) => t.group === g).map((t) => {
              const v = values[t.key];
              const isOpen = open === t.key;
              return (
                <li key={t.key}>
                  <button type="button" onClick={() => setOpen(isOpen ? null : t.key)} className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition hover:bg-bg-2/60">
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        {t.label}
                        {customized.includes(t.key) && <Badge tone="brand">Personalizada</Badge>}
                      </span>
                      <span className="block truncate text-xs text-muted">{t.audience}</span>
                    </span>
                    {t.channels.includes("app") && <ChannelDot on={v.app !== false} icon={Bell} label="App" />}
                    {t.channels.includes("email") && <ChannelDot on={v.email !== false} icon={Mail} label="E-mail" />}
                    <ChevronDown className={cx("size-4 shrink-0 text-muted transition", isOpen && "rotate-180")} />
                  </button>
                  {isOpen && (
                    <TemplateEditor t={t} initial={v} layout={values.email_layout} sample={values.os_assigned} customized={customized.includes(t.key)} emailReady={emailReady} adminEmail={adminEmail} />
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      ))}
    </div>
  );
}

function ChannelDot({ on, icon: Icon, label }: { on: boolean; icon: typeof Bell; label: string }) {
  return (
    <span title={`${label}: ${on ? "ligado" : "desligado"}`} className={cx("hidden items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium sm:inline-flex", on ? "bg-ok/10 text-ok" : "bg-bg-2 text-muted line-through")}>
      <Icon className="size-3" />{label}
    </span>
  );
}

function TemplateEditor({ t, initial, layout, sample, customized, emailReady, adminEmail }: { t: TemplateDef; initial: TemplateValues; layout: TemplateValues; sample: TemplateValues; customized: boolean; emailReady: boolean; adminEmail: string }) {
  const [v, setV] = useState(initial);
  const [baseline, setBaseline] = useState(initial);
  const [isCustom, setIsCustom] = useState(customized);
  const [intent, setIntent] = useState<Intent | null>(null);
  // Uma só ação para salvar, testar e restaurar: a mensagem exibida é sempre a do último clique
  const [state, run, pending] = useActionState(async (_prev: MessageState, p: { intent: Intent; data?: FormData; snapshot?: TemplateValues }) => {
    if (p.intent === "test") return sendTemplateTest(t.key, undefined, p.data!);
    if (p.intent === "reset") {
      const r = await resetTemplate(t.key, undefined);
      if (r?.ok) {
        const d = templateDefaults(t);
        setV(d);
        setBaseline(d);
        setIsCustom(false);
      }
      return r;
    }
    const r = await saveTemplate(t.key, undefined, p.data!);
    if (r?.ok) {
      setBaseline(p.snapshot!);
      setIsCustom(true);
    }
    return r;
  }, undefined);
  const focused = useRef<{ key: string; el: HTMLInputElement | HTMLTextAreaElement } | null>(null);
  const dirty = JSON.stringify(v) !== JSON.stringify(baseline);
  const busy = (i: Intent) => pending && intent === i;

  function go(i: Intent, data?: FormData) {
    setIntent(i);
    startTransition(() => run({ intent: i, data, snapshot: v }));
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    go(submitter?.dataset.intent === "test" ? "test" : "save", new FormData(e.currentTarget));
  }

  function rememberFocus(key: string, el: HTMLInputElement | HTMLTextAreaElement) {
    focused.current = { key, el };
  }

  /** Insere {variável} onde está o cursor do último campo focado. */
  function insertVar(name: string) {
    const f = focused.current ?? { key: t.fields.at(-1)!.key, el: null as never };
    const cur = String(v[f.key] ?? "");
    const pos = f.el?.selectionStart ?? cur.length;
    const next = `${cur.slice(0, pos)}{${name}}${cur.slice(f.el?.selectionEnd ?? pos)}`;
    setV((x) => ({ ...x, [f.key]: next }));
    requestAnimationFrame(() => {
      f.el?.focus();
      f.el?.setSelectionRange(pos + name.length + 2, pos + name.length + 2);
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-6 border-t border-line bg-surface-2 p-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <input type="hidden" name="data" value={JSON.stringify(v)} />
      <div className="space-y-4">
        {t.channels.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {t.channels.map((c) => (
              <label key={c} className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-sm">
                <input type="checkbox" checked={v[c] !== false} onChange={(e) => setV((x) => ({ ...x, [c]: e.target.checked }))} className="size-4 accent-[var(--brand)]" />
                {c === "app" ? <><Bell className="size-4 text-muted" />Notificação no app</> : <><Mail className="size-4 text-muted" />E-mail</>}
              </label>
            ))}
          </div>
        )}
        {t.fields.map((f) => (
          <TemplateField key={f.key} f={f} value={String(v[f.key] ?? "")} onChange={(val) => setV((x) => ({ ...x, [f.key]: val }))} onFocusField={rememberFocus} />
        ))}
        <div>
          <p className="mb-1.5 text-[13px] font-medium text-fg-2">Variáveis <span className="font-normal text-muted">— clique para inserir no campo selecionado</span></p>
          <div className="flex flex-wrap gap-1.5">
            {t.vars.map((x) => (
              <button key={x.name} type="button" onClick={() => insertVar(x.name)} title={`${x.desc} (ex.: ${x.sample})`} className="rounded-md border border-line bg-surface px-2 py-1 font-mono text-[11px] text-brand transition hover:border-brand">
                {`{${x.name}}`}{t.required?.includes(x.name) && <span className="text-bad">*</span>}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-muted">Uma linha com variável vazia (ex.: sem comentário) é omitida automaticamente.</p>
        </div>

        {state?.error && <Alert>{state.error}</Alert>}
        {state?.ok && state.message && <Alert tone="ok">{state.message}</Alert>}
        <div className="flex flex-wrap gap-2">
          <SubmitButton pending={busy("save")} pendingText="Salvando…" disabled={(!dirty && !busy("save")) || pending}>Salvar</SubmitButton>
          {(t.channels.includes("email") || t.channels.length === 0) && (
            <button type="submit" data-intent="test" disabled={pending || !emailReady} title={emailReady ? `Envia para ${adminEmail}` : "Configure o e-mail primeiro"} className={buttonClass("outline")}>
              <Send className="size-4" />{busy("test") ? "Enviando…" : "Enviar teste"}
            </button>
          )}
          {isCustom && (
            <button type="button" disabled={pending} onClick={() => go("reset")} className={cx(buttonClass("ghost"), "ml-auto")}>
              <RotateCcw className="size-4" />Restaurar padrão
            </button>
          )}
        </div>
      </div>

      <Preview t={t} v={v} layout={layout} sample={sample} />
    </form>
  );
}

function TemplateField({ f, value, onChange, onFocusField }: { f: TemplateDef["fields"][number]; value: string; onChange: (v: string) => void; onFocusField: (key: string, el: HTMLInputElement | HTMLTextAreaElement) => void }) {
  return (
    <Field label={f.label} hint={f.hint}>
      {f.kind === "textarea" ? (
        <Textarea rows={Math.min(6, Math.max(2, value.split("\n").length + 1))} maxLength={2000} value={value} onChange={(e) => onChange(e.target.value)} onFocus={(e) => onFocusField(f.key, e.currentTarget)} />
      ) : (
        <Input maxLength={200} value={value} onChange={(e) => onChange(e.target.value)} onFocus={(e) => onFocusField(f.key, e.currentTarget)} />
      )}
    </Field>
  );
}

/** Como a mensagem aparece no sino e no e-mail, com valores de exemplo. */
function Preview({ t, v, layout, sample }: { t: TemplateDef; v: TemplateValues; layout: TemplateValues; sample: TemplateValues }) {
  const isLayout = t.key === "email_layout";
  const src = isLayout ? templateDef("os_assigned")! : t;
  const values = isLayout ? sample : v;
  const lay = isLayout ? v : layout;
  const vars = sampleVars(src);
  const f = (k: string, from: TemplateValues) => fill(String(from[k] ?? ""), { ...vars, nome: "Ana" });
  const access = t.group === "Acesso";
  const showApp = t.channels.includes("app") && v.app !== false;
  const showEmail = access || isLayout || (t.channels.includes("email") && v.email !== false);

  const html = !showEmail
    ? ""
    : renderEmail({
      title: f("title", values),
      intro: access ? undefined : f("greeting", lay),
      lines: f("message", values).split("\n"),
      cta: { label: access ? f("cta", values) : f("ctaOrder", lay), url: "#" },
      footnote: access ? f("footnote", values) : f("footnote", lay),
      footer: f("footer", lay),
      }).html;

  return (
    <div className="space-y-4">
      {showApp && (
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted">No sino do app</p>
          <div className="flex gap-3 rounded-xl border border-line bg-surface px-4 py-3">
            <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand" />
            <span className="min-w-0">
              <span className="block text-sm font-medium">{f("title", values)}</span>
              <span className="block whitespace-pre-line text-sm text-muted">{f("message", values)}</span>
            </span>
          </div>
        </div>
      )}
      {showEmail ? (
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted">
            E-mail{access ? ` · assunto: ${f("subject", values)}` : isLayout ? " · exemplo com “OS atribuída”" : ` · assunto: ${f("title", values)}`}
          </p>
          <iframe title="Prévia do e-mail" srcDoc={html} sandbox="" className="h-[440px] w-full rounded-xl border border-line bg-white" />
        </div>
      ) : (
        !showApp && <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">Os dois canais estão desligados: esta mensagem não será enviada.</p>
      )}
    </div>
  );
}
