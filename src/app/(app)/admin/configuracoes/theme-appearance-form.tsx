"use client";

import { startTransition, useActionState, useEffect, useRef, useState, type CSSProperties } from "react";
import { AlertTriangle, Bell, CheckCircle2, ChevronDown, ClipboardList, Eye, EyeOff, LayoutDashboard, Moon, RotateCcw, Sun, Users } from "lucide-react";
import { saveThemeAppearance } from "@/app/actions/theme-appearance";
import {
  BRAND_PRESETS,
  DERIVED_KEYS,
  HEX_RE,
  THEME_DEFAULTS,
  THEME_SECTIONS,
  contrastIssues,
  emptyTheme,
  resolveColors,
  themeVars,
  type ThemeAppearance,
  type ThemeKey,
  type ThemeMode,
} from "@/lib/theme-appearance";
import { Alert, Badge, Card, Input, buttonClass, cx } from "@/components/ui";
import { LogoMark } from "@/components/logo";
import { SubmitButton } from "@/components/submit-button";

const MODES = { light: { label: "Tema claro", icon: Sun }, dark: { label: "Tema escuro", icon: Moon } } as const;

/** Editor das cores do sistema com prévia ao vivo. */
export function ThemeAppearanceForm({ initial, current }: { initial: ThemeAppearance; current: ThemeMode }) {
  const [t, setT] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [mode, setMode] = useState<ThemeMode>(current);
  const [showPreview, setShowPreview] = useState(true);
  const [state, save, saving] = useActionState(saveThemeAppearance, undefined);
  const dirty = JSON.stringify(t) !== JSON.stringify(saved);
  const set = (k: ThemeKey, v: string) => setT((x) => ({ ...x, [mode]: { ...x[mode], [k]: v } }));

  const lastSubmitted = useRef(t);
  useEffect(() => {
    if (state?.ok) setSaved(lastSubmitted.current);
  }, [state]);

  const resolved = resolveColors(t, mode);
  const issues = contrastIssues(t, mode);
  const presetActive = (p: (typeof BRAND_PRESETS)[number]) => t.light.brand === p.light && t.dark.brand === p.dark;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        lastSubmitted.current = t;
        startTransition(() => save(fd));
      }}
      className="min-w-0 space-y-6"
    >
      <input type="hidden" name="data" value={JSON.stringify(t)} />

      <p className="text-sm text-muted">
        Cores de todas as páginas do sistema, inclusive a tela de login (quando ela não tem cor própria em “Página de login”). Os temas claro e escuro têm cores separadas; campos vazios usam a cor padrão.
      </p>

      {/* Prévia fixa sob o cabeçalho; a faixa com o fundo da página cobre o vão acima dela */}
      <div className="z-10 lg:sticky lg:top-16 lg:-mt-3 lg:bg-bg lg:pt-3">
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
            <p className="mr-auto text-sm font-semibold">Prévia</p>
            <div className="inline-flex rounded-lg bg-bg-2 p-0.5">
              {(Object.keys(MODES) as ThemeMode[]).map((k) => {
                const Icon = MODES[k].icon;
                return (
                  <button key={k} type="button" onClick={() => setMode(k)} className={cx("inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition", mode === k ? "bg-surface text-fg shadow-card" : "text-muted hover:text-fg")}>
                    <Icon className="size-3.5" />{MODES[k].label}
                  </button>
                );
              })}
            </div>
            <button type="button" onClick={() => setShowPreview((v) => !v)} className={buttonClass("ghost", "sm")}>
              {showPreview ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}{showPreview ? "Ocultar" : "Mostrar"}
            </button>
          </div>
          {showPreview && <Preview t={t} mode={mode} />}
        </Card>
      </div>

      <Card>
        <div className="space-y-3 p-5">
          <p className="font-display text-[15px] font-semibold">Atalhos de cor principal</p>
          <p className="text-xs text-muted">Aplica a cor principal nos dois temas, com um tom ajustado para o escuro.</p>
          <div className="flex flex-wrap gap-2">
            {BRAND_PRESETS.map((p) => (
              <button
                key={p.name}
                type="button"
                onClick={() => setT((x) => ({ ...x, light: { ...x.light, brand: p.light }, dark: { ...x.dark, brand: p.dark } }))}
                className={cx("inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition", presetActive(p) ? "border-brand bg-brand-soft text-brand" : "border-line-strong text-fg-2 hover:bg-bg-2")}
              >
                <span className="size-3.5 rounded-full" style={{ background: p.light || THEME_DEFAULTS.light.brand }} />
                {p.name}
              </button>
            ))}
          </div>
          <label className="mt-2 flex items-start gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3">
            <input type="checkbox" checked={t.logoFollowsBrand} onChange={(e) => setT((x) => ({ ...x, logoFollowsBrand: e.target.checked }))} className="mt-0.5 size-4 accent-[var(--brand)]" />
            <span>
              <span className="block text-sm font-medium">Logo na cor principal</span>
              <span className="block text-xs text-muted">Desligado, o ícone do Condtrack mantém o degradê índigo original.</span>
            </span>
          </label>
        </div>
      </Card>

      {issues.length > 0 && (
        <Alert tone="warn">
          <span className="font-semibold">Contraste baixo no {mode === "light" ? "tema claro" : "tema escuro"}:</span>{" "}
          {issues.map((i) => `${i.label} (${String(i.ratio).replace(".", ",")}:1)`).join("; ")}. Textos podem ficar difíceis de ler.
        </Alert>
      )}

      {THEME_SECTIONS.map((s, i) => (
        <Card key={s.title}>
          <details open={i < 3} className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 font-display text-[15px] font-semibold">
              <span>{s.title} <span className="font-sans text-xs font-normal text-muted">· {MODES[mode].label.toLowerCase()}</span></span>
              <ChevronDown className="size-4 text-muted transition group-open:rotate-180" />
            </summary>
            <div className="grid gap-5 border-t border-line p-5 sm:grid-cols-2">
              {s.tokens.map((tok) => (
                <ColorEditor
                  key={`${mode}-${tok.key}`}
                  label={tok.label}
                  hint={tok.hint}
                  value={t[mode][tok.key]}
                  effective={resolved[tok.key]}
                  auto={DERIVED_KEYS.includes(tok.key) && !!t[mode].brand}
                  onChange={(v) => set(tok.key, v)}
                />
              ))}
            </div>
          </details>
        </Card>
      ))}

      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface/95 p-3 shadow-pop backdrop-blur lg:bottom-4">
        <SubmitButton pending={saving} pendingText="Salvando…" disabled={!dirty && !saving}>Salvar</SubmitButton>
        <button type="button" onClick={() => setT(saved)} disabled={!dirty} className={buttonClass("ghost")}>Desfazer alterações</button>
        <button type="button" onClick={() => setT((x) => ({ ...x, [mode]: emptyTheme()[mode] }))} className={cx(buttonClass("ghost"), "ml-auto")}>
          <RotateCcw className="size-4" />Padrão do {mode === "light" ? "claro" : "escuro"}
        </button>
        <button type="button" onClick={() => setT(emptyTheme())} className={buttonClass("ghost")}>
          <RotateCcw className="size-4" />Restaurar tudo
        </button>
        <p className="basis-full text-xs text-muted">{dirty ? "Há alterações não salvas." : "Tudo salvo."} As cores só mudam para todos depois de salvar.</p>
        {state?.error && <div className="basis-full"><Alert>{state.error}</Alert></div>}
        {state?.ok && !dirty && <p className="basis-full text-xs font-medium text-ok">{state.message}</p>}
      </div>
    </form>
  );
}

/** Cor com "padrão" (vazio). `effective` é a cor que está valendo. */
function ColorEditor({ label, hint, value, effective, auto, onChange }: { label: string; hint?: string; value: string; effective: string; auto: boolean; onChange: (v: string) => void }) {
  // Rascunho enquanto a cor digitada está incompleta; fora disso, mostra o valor salvo
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div>
      <p className="mb-1.5 text-[13px] font-medium text-fg-2">{label}</p>
      <div className="flex items-center gap-2">
        <input type="color" value={effective} onChange={(e) => onChange(e.target.value)} className="h-10 w-12 shrink-0 cursor-pointer rounded-xl border border-line-strong bg-surface p-1" aria-label={label} />
        <Input
          value={draft ?? value}
          placeholder={auto ? `Automática (${effective})` : `Padrão (${effective})`}
          maxLength={7}
          onChange={(e) => {
            let v = e.target.value.trim();
            if (v && !v.startsWith("#")) v = `#${v}`;
            // Só aplica quando a cor está completa (ou vazia = padrão)
            if (v === "" || HEX_RE.test(v)) {
              setDraft(null);
              onChange(v.toLowerCase());
            } else setDraft(v);
          }}
          onBlur={() => setDraft(null)}
          className="font-mono"
        />
        {value && (
          <button type="button" onClick={() => onChange("")} className={cx(buttonClass("ghost", "sm"), "shrink-0")}>Padrão</button>
        )}
      </div>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

/** Miniatura do sistema com as cores do tema em edição (variáveis locais ao bloco). */
function Preview({ t, mode }: { t: ThemeAppearance; mode: ThemeMode }) {
  const style = { ...themeVars(t, mode), colorScheme: mode } as CSSProperties;
  const nav = [
    { icon: LayoutDashboard, label: "Painel", active: true },
    { icon: ClipboardList, label: "Ordens de serviço" },
    { icon: Users, label: "Usuários" },
  ];
  return (
    <div style={style} inert className="bg-bg p-3 text-fg sm:p-4">
      <div className="grid gap-3 sm:grid-cols-[150px_1fr]">
        <div className="hidden space-y-1 sm:block">
          <div className="mb-3 flex items-center gap-2 px-1">
            <LogoMark size={22} />
            <span className="font-display text-sm font-bold">Cond<span className="text-brand">track</span></span>
          </div>
          {nav.map(({ icon: Icon, label, active }) => (
            <span key={label} className={cx("flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium", active ? "bg-brand-soft text-brand" : "text-fg-2")}>
              <Icon className="size-3.5" />{label}
            </span>
          ))}
        </div>
        <div className="min-w-0 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-medium text-brand">Síndico</p>
              <p className="font-display text-base font-bold">Painel do condomínio</p>
            </div>
            <span className="inline-flex size-7 items-center justify-center rounded-lg bg-bg-2 text-fg-2"><Bell className="size-3.5" /></span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[["Abertas", "12", "text-info"], ["Aprovadas", "48", "text-ok"], ["Atrasadas", "3", "text-bad"]].map(([l, v, c]) => (
              <div key={l} className="rounded-xl border border-line bg-surface p-2.5 shadow-card">
                <p className="text-[10px] text-muted">{l}</p>
                <p className={cx("font-display text-lg font-bold", c)}>{v}</p>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-line bg-surface shadow-card">
            <div className="flex items-center justify-between border-b border-line px-3 py-2">
              <p className="text-xs font-semibold">OS-2026-00012 · Repintura do hall</p>
              <Badge tone="ok" dot>Aprovada</Badge>
            </div>
            <div className="space-y-2.5 p-3">
              <div className="flex flex-wrap gap-1.5">
                <Badge tone="warn" dot>Pendente</Badge>
                <Badge tone="info" dot>Em execução</Badge>
                <Badge tone="bad" dot>Reprovada</Badge>
                <Badge tone="brand">Pintura</Badge>
              </div>
              <div className="flex items-end gap-1.5 rounded-lg bg-surface-2 p-2" style={{ height: 56 }}>
                {[40, 65, 50, 80, 60, 90].map((h, i) => (
                  <span key={i} className="flex-1 rounded-t" style={{ height: `${h}%`, background: i % 2 ? "var(--chart-2)" : "var(--chart-1)" }} />
                ))}
              </div>
              <div className="flex items-center gap-2 rounded-lg bg-elevated px-2.5 py-1.5 text-[11px] text-fg-2">
                <CheckCircle2 className="size-3.5 text-ok" /> Validado pelo zelador · <span className="text-muted">há 2 horas</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={cx(buttonClass("brand", "sm"))}>Aprovar</span>
                <span className={cx(buttonClass("outline", "sm"))}>Detalhes</span>
                <span className={cx(buttonClass("danger", "sm"))}><AlertTriangle className="size-3" />Reprovar</span>
                <span className="ml-auto h-8 min-w-24 flex-1 rounded-xl border border-brand bg-surface px-2.5 text-xs leading-8 text-muted ring-4 ring-brand/15">Campo em foco</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
