"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";
import { Check, Copy, Eye, EyeOff, PlugZap, Send } from "lucide-react";
import { saveSettingsGroup, sendTestEmail, testNeonConnection, testStripeConnection, testVercelConnection, type SettingsState } from "@/app/actions/settings";
import type { FieldDef, SettingsGroup } from "@/lib/settings-schema";
import { Alert, Badge, Field, Input, Select, buttonClass, cx } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export type ClientField = FieldDef & { value: string | number | boolean | null; masked?: string; source: "saved" | "env" | "default" };

const SOURCE: Record<ClientField["source"], { label: string; tone: "ok" | "info" | "muted" }> = {
  saved: { label: "Salvo aqui", tone: "ok" },
  env: { label: "Variável de ambiente", tone: "info" },
  default: { label: "Padrão", tone: "muted" },
};

type TestAction = (s: SettingsState, f: FormData) => Promise<SettingsState>;
const TESTS: Partial<Record<SettingsGroup, { action: TestAction; label: string; pending: string; icon: typeof Send }>> = {
  stripe: { action: testStripeConnection, label: "Testar conexão", pending: "Testando…", icon: PlugZap },
  email: { action: sendTestEmail, label: "Enviar e-mail de teste", pending: "Enviando…", icon: Send },
  vercel: { action: testVercelConnection, label: "Testar conexão", pending: "Testando…", icon: PlugZap },
  neon: { action: testNeonConnection, label: "Testar conexão", pending: "Testando…", icon: PlugZap },
};
const noTest: TestAction = async () => undefined;

export function SettingsForm({ group, fields, adminEmail }: { group: SettingsGroup; fields: ClientField[]; adminEmail?: string }) {
  const [state, save, saving] = useActionState(saveSettingsGroup.bind(null, group), undefined);
  const testDef = TESTS[group];
  const [test, runTest, testing] = useActionState(testDef?.action ?? noTest, undefined);
  // Envio manual (sem reset automático do React): o botão clicado decide a ação
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const data = new FormData(e.currentTarget, submitter);
    startTransition(() => (submitter?.dataset.intent === "test" ? runTest(data) : save(data)));
  }
  // Valores atuais dos selects, para mostrar/ocultar campos dependentes (showIf)
  const [watch, setWatch] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.filter((f) => f.type === "select").map((f) => [f.key, String(f.value ?? "")])),
  );
  const visible = (f: ClientField) => !f.showIf || f.showIf.in.includes(watch[f.showIf.field] ?? "");

  return (
    <form action={save} onSubmit={onSubmit} className="space-y-5">
      {fields.map((f) => (
        // Campos ocultos continuam no DOM para não apagar valores já salvos
        <div key={f.key} className={visible(f) ? undefined : "hidden"}>
          <FieldInput f={f} onSelect={(v) => setWatch((w) => ({ ...w, [f.key]: v }))} />
        </div>
      ))}
      {group === "email" && (
        <div className="rounded-xl border border-dashed border-line p-4">
          <Field label="Enviar e-mail de teste para" hint="Usa os valores do formulário, mesmo antes de salvar.">
            <Input name="testTo" type="email" placeholder={adminEmail} />
          </Field>
        </div>
      )}
      {state?.error && <Alert>{state.error}</Alert>}
      {state?.message && <Alert tone="ok">{state.message}</Alert>}
      {test?.error && <Alert>{test.error}</Alert>}
      {test?.message && <Alert tone="ok">{test.message}</Alert>}
      <div className="flex flex-wrap gap-2 border-t border-line pt-5">
        <SubmitButton pending={saving} pendingText="Salvando…">Salvar</SubmitButton>
        {testDef && (
          <button type="submit" data-intent="test" disabled={testing} className={buttonClass("outline")}>
            <testDef.icon className="size-4" />{testing ? testDef.pending : testDef.label}
          </button>
        )}
      </div>
    </form>
  );
}

function FieldInput({ f, onSelect }: { f: ClientField; onSelect: (v: string) => void }) {
  const [show, setShow] = useState(false);
  const src = SOURCE[f.source];
  const label = (
    <span className="flex items-center gap-2">
      {f.label}
      {f.type !== "boolean" && <Badge tone={src.tone} className="!py-0 !text-[10px]">{src.label}</Badge>}
    </span>
  );

  if (f.type === "boolean") {
    return (
      <label className="flex items-start gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3">
        <input type="checkbox" name={f.key} defaultChecked={!!f.value} className="mt-0.5 size-4 accent-[var(--brand)]" />
        <span>
          <span className="block text-sm font-medium">{f.label}</span>
          {f.hint && <span className="block text-xs text-muted">{f.hint}</span>}
        </span>
      </label>
    );
  }

  if (f.type === "select") {
    return (
      <Field label={f.label} hint={f.hint}>
        <Select name={f.key} defaultValue={String(f.value ?? "")} onChange={(e) => onSelect(e.target.value)}>{f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>
      </Field>
    );
  }

  if (f.type === "secret") {
    return (
      <div>
        <p className="mb-1.5 text-[13px] font-medium text-fg-2">{label}</p>
        {f.masked && (
          <p className="mb-2 flex items-center gap-2 font-mono text-xs text-muted">
            Atual: {f.masked}
            {f.source === "saved" && (
              <label className="ml-auto flex items-center gap-1.5 font-sans"><input type="checkbox" name={`clear_${f.key}`} className="size-3.5 accent-[var(--bad)]" />remover</label>
            )}
          </p>
        )}
        <div className="relative">
          <Input name={f.key} type={show ? "text" : "password"} autoComplete="off" placeholder={f.masked ? "Deixe vazio para manter" : f.placeholder} className="pr-10 font-mono" />
          <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted hover:text-fg" aria-label={show ? "Ocultar" : "Mostrar"}>
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        {f.hint && <p className="mt-1 text-xs text-muted">{f.hint}</p>}
      </div>
    );
  }

  return (
    <div>
      <p className="mb-1.5 text-[13px] font-medium text-fg-2">{label}</p>
      <Input
        name={f.key}
        type={f.type === "number" ? "number" : "text"}
        min={f.min}
        max={f.max}
        defaultValue={f.source === "saved" || f.type === "number" ? String(f.value ?? "") : ""}
        placeholder={f.source === "env" ? `${String(f.value)} (do ambiente)` : f.placeholder ?? (f.default != null ? String(f.default) : undefined)}
        className={cx(f.key.toLowerCase().includes("key") && "font-mono")}
      />
      {f.hint && <p className="mt-1 text-xs text-muted">{f.hint}</p>}
    </div>
  );
}

export function CopyField({ value }: { value: string }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-xl border border-line bg-bg-2 px-3 py-2">
      <code className="flex-1 truncate text-xs">{value}</code>
      <button type="button" onClick={() => navigator.clipboard.writeText(value).then(() => setOk(true))} className="rounded-md p-1 text-muted hover:text-fg" aria-label="Copiar">
        {ok ? <Check className="size-4 text-ok" /> : <Copy className="size-4" />}
      </button>
    </div>
  );
}
