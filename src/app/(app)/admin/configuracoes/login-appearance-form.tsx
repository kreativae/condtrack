"use client";

import { startTransition, useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ExternalLink, Eye, EyeOff, ImagePlus, Loader2, Monitor, RotateCcw, ScanFace, Smartphone, Trash2 } from "lucide-react";
import { saveLoginAppearance } from "@/app/actions/login-appearance";
import { LOGIN_DEFAULTS, LOGIN_SECTIONS, fieldVisible, type LoginAppearance, type LoginField } from "@/lib/login-appearance";
import { LoginScreen } from "@/components/login-screen";
import { Alert, Card, Field, Input, Select, Textarea, buttonClass, cx } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

const COLOR_START: Partial<Record<LoginField["key"], string>> = { formBg: "#ffffff", titleColor: "#0f172a", textColor: "#475569" };

const DEVICES = { desktop: { w: 1280, h: 800, label: "Computador", icon: Monitor }, mobile: { w: 390, h: 844, label: "Celular", icon: Smartphone } } as const;

/** Editor da página de login com prévia ao vivo. */
export function LoginAppearanceForm({ initial, passkeys }: { initial: LoginAppearance; passkeys: boolean }) {
  const [a, setA] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [state, save, saving] = useActionState(saveLoginAppearance, undefined);
  const [device, setDevice] = useState<keyof typeof DEVICES>("desktop");
  const [showPreview, setShowPreview] = useState(true);
  const dirty = JSON.stringify(a) !== JSON.stringify(saved);
  const set = <K extends keyof LoginAppearance>(k: K, v: LoginAppearance[K]) => setA((x) => ({ ...x, [k]: v }));

  // Salvou: o estado atual vira a referência de "sem alterações"
  const lastSubmitted = useRef(a);
  useEffect(() => {
    if (state?.ok) setSaved(lastSubmitted.current);
  }, [state]);

  const D = DEVICES[device];
  return (
    <form
      onSubmit={(e) => {
        // Envio manual: evita o reset automático do form (campos controlados)
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        lastSubmitted.current = a;
        startTransition(() => save(fd));
      }}
      className="space-y-6"
    >
      <input type="hidden" name="data" value={JSON.stringify(a)} />

      {/* Prévia: acompanha a rolagem em telas largas */}
      <Card className="z-10 overflow-hidden lg:sticky lg:top-[calc(4rem+var(--chrome,0rem)+0.75rem)]">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
          <p className="mr-auto text-sm font-semibold">Prévia</p>
          <div className="inline-flex rounded-lg bg-bg-2 p-0.5">
            {(Object.keys(DEVICES) as (keyof typeof DEVICES)[]).map((k) => {
              const Icon = DEVICES[k].icon;
              return (
                <button key={k} type="button" onClick={() => setDevice(k)} className={cx("inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition", device === k ? "bg-surface text-fg shadow-card" : "text-muted hover:text-fg")}>
                  <Icon className="size-3.5" />{DEVICES[k].label}
                </button>
              );
            })}
          </div>
          <button type="button" onClick={() => setShowPreview((v) => !v)} className={buttonClass("ghost", "sm")}>
            {showPreview ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}{showPreview ? "Ocultar" : "Mostrar"}
          </button>
          <a href="/login" target="_blank" rel="noopener" className={buttonClass("ghost", "sm")} title="Abre a página salva (faça logout ou use uma janela anônima)">
            <ExternalLink className="size-3.5" />Abrir
          </a>
        </div>
        <div className={cx("bg-bg-2 p-3", !showPreview && "hidden")}>
          <Scaled w={D.w} h={D.h} maxH={device === "desktop" ? 380 : 420}>
            <LoginScreen a={a} preview form={<MockForm a={a} passkeys={passkeys} />} />
          </Scaled>
        </div>
      </Card>

      {LOGIN_SECTIONS.map((s, i) => {
        const fields = s.fields.filter((f) => fieldVisible(f, a));
        if (!fields.length) return null;
        return (
          <Card key={s.title}>
            <details open={i < 2} className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 font-display text-[15px] font-semibold">
                {s.title}
                <ChevronDown className="size-4 text-muted transition group-open:rotate-180" />
              </summary>
              <div className="grid gap-5 border-t border-line p-5 sm:grid-cols-2">
                {fields.map((f) => (
                  <div key={f.key} className={cx((f.kind === "textarea" || f.kind === "image" || f.kind === "boolean") && "sm:col-span-2")}>
                    <FieldEditor f={f} value={a[f.key]} onChange={(v) => set(f.key, v as never)} />
                  </div>
                ))}
              </div>
            </details>
          </Card>
        );
      })}

      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface/95 p-3 shadow-pop backdrop-blur lg:bottom-4">
        <SubmitButton pending={saving} pendingText="Salvando…" disabled={!dirty && !saving}>Salvar</SubmitButton>
        <button type="button" onClick={() => setA(saved)} disabled={!dirty} className={buttonClass("ghost")}>Desfazer alterações</button>
        <button type="button" onClick={() => setA({ ...LOGIN_DEFAULTS })} className={cx(buttonClass("ghost"), "ml-auto")}>
          <RotateCcw className="size-4" />Restaurar padrão
        </button>
        <p className="basis-full text-xs text-muted">{dirty ? "Há alterações não salvas." : "Tudo salvo."} “Restaurar padrão” só vale depois de salvar.</p>
        {state?.error && <div className="basis-full"><Alert>{state.error}</Alert></div>}
        {state?.ok && !dirty && <p className="basis-full text-xs font-medium text-ok">{state.message}</p>}
      </div>
    </form>
  );
}

function FieldEditor({ f, value, onChange }: { f: LoginField; value: string | number | boolean; onChange: (v: string | number | boolean) => void }) {
  switch (f.kind) {
    case "boolean":
      return (
        <label className="flex items-start gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3">
          <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-4 accent-[var(--brand)]" />
          <span>
            <span className="block text-sm font-medium">{f.label}</span>
            {f.hint && <span className="block text-xs text-muted">{f.hint}</span>}
          </span>
        </label>
      );
    case "textarea":
      return <Field label={f.label} hint={f.hint}><Textarea rows={2} value={String(value)} maxLength={300} onChange={(e) => onChange(e.target.value)} /></Field>;
    case "number":
      return <Field label={f.label} hint={f.hint}><Input type="number" min={f.min} max={f.max} value={String(value)} onChange={(e) => onChange(Number(e.target.value))} /></Field>;
    case "select":
      return (
        <Field label={f.label} hint={f.hint}>
          <Select value={String(value)} onChange={(e) => onChange(e.target.value)}>{f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>
        </Field>
      );
    case "color":
      return <ColorEditor f={f} value={String(value)} onChange={onChange} />;
    case "image":
      return <ImageEditor f={f} value={String(value)} onChange={onChange} />;
    default:
      return <Field label={f.label} hint={f.hint}><Input value={String(value)} maxLength={300} onChange={(e) => onChange(e.target.value)} /></Field>;
  }
}

/** Cor com opção "automática" (vazio = segue o tema claro/escuro). */
function ColorEditor({ f, value, onChange }: { f: LoginField; value: string; onChange: (v: string) => void }) {
  const auto = value === "";
  // Ponto de partida do seletor quando a cor está em "automática"
  const fallback = (LOGIN_DEFAULTS[f.key] as string) || COLOR_START[f.key] || "#5b5bd6";
  const canAuto = LOGIN_DEFAULTS[f.key] === "";
  return (
    <div>
      <p className="mb-1.5 text-[13px] font-medium text-fg-2">{f.label}</p>
      <div className="flex items-center gap-2">
        <input type="color" value={auto ? fallback : value} onChange={(e) => onChange(e.target.value)} className="h-10 w-12 shrink-0 cursor-pointer rounded-xl border border-line-strong bg-surface p-1" aria-label={f.label} />
        <Input value={auto ? "" : value} placeholder={canAuto ? "Automática (tema)" : fallback} maxLength={7} onChange={(e) => onChange(e.target.value.trim())} className="font-mono" />
        {canAuto && !auto && (
          <button type="button" onClick={() => onChange("")} className={cx(buttonClass("ghost", "sm"), "shrink-0")}>Automática</button>
        )}
      </div>
      {f.hint && <p className="mt-1 text-xs text-muted">{f.hint}</p>}
    </div>
  );
}

function ImageEditor({ f, value, onChange }: { f: LoginField; value: string; onChange: (v: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/branding", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) throw new Error(data.error ?? "Falha no envio.");
      onChange(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha no envio.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  return (
    <div>
      <p className="mb-1.5 text-[13px] font-medium text-fg-2">{f.label}</p>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-[repeating-conic-gradient(var(--bg-2)_0_25%,var(--surface)_0_50%)] bg-[length:12px_12px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {value ? <img src={value} alt="" className="max-h-full max-w-full object-contain" /> : <ImagePlus className="size-5 text-muted" />}
        </div>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        <button type="button" onClick={() => input.current?.click()} disabled={busy} className={buttonClass("outline", "sm")}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <ImagePlus className="size-3.5" />}
          {busy ? "Enviando…" : value ? "Trocar" : "Enviar imagem"}
        </button>
        {value && (
          <button type="button" onClick={() => onChange("")} className={cx(buttonClass("ghost", "sm"), "text-bad")}>
            <Trash2 className="size-3.5" />Remover
          </button>
        )}
      </div>
      {f.hint && <p className="mt-1 text-xs text-muted">{f.hint}</p>}
      {error && <p className="mt-1 text-xs text-bad">{error}</p>}
    </div>
  );
}

/** Formulário ilustrativo (sem envio) com os textos atuais. */
function MockForm({ a, passkeys }: { a: LoginAppearance; passkeys: boolean }) {
  return (
    <div className="space-y-5">
      {passkeys && (
        <div>
          <span className={cx(buttonClass("outline"), "h-11 w-full")}><ScanFace className="size-5 text-brand" />{a.passkeyText}</span>
          <div className="mt-5 flex items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-line" /> {a.dividerText} <span className="h-px flex-1 bg-line" />
          </div>
        </div>
      )}
      <Field label={a.emailLabel}><Input readOnly tabIndex={-1} placeholder={a.emailPlaceholder} /></Field>
      <Field label={a.passwordLabel}><Input readOnly tabIndex={-1} placeholder={a.passwordPlaceholder} /></Field>
      <span className={cx(buttonClass("brand"), "w-full")}>{a.buttonText}</span>
      {a.showHelp && <p className="text-center text-xs text-muted" style={a.textColor ? { color: a.textColor } : undefined}>{a.helpText}</p>}
    </div>
  );
}

/** Renderiza o conteúdo em tamanho real (w×h) e reduz para caber na largura disponível. */
function Scaled({ w, h, maxH, children }: { w: number; h: number; maxH: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [cw, setCw] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setCw(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const s = cw ? Math.min(cw / w, maxH / h, 1) : 0;
  return (
    <div ref={ref} className="w-full">
      <div className="mx-auto overflow-hidden rounded-xl border border-line bg-surface shadow-card" style={{ width: w * s, height: h * s }}>
        <div inert style={{ width: w, height: h, transform: `scale(${s})`, transformOrigin: "top left" }}>{children}</div>
      </div>
    </div>
  );
}
