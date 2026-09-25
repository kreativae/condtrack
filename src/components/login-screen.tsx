import type { CSSProperties, ReactNode } from "react";
import { Check, Clock, ShieldCheck, Sparkles } from "lucide-react";
import { Logo } from "./logo";
import { cx } from "./ui";
import { heroBackground, loginSteps, type LoginAppearance } from "@/lib/login-appearance";

/**
 * Tela de login personalizável (Configurações → Página de login). Usada pela
 * página real e pela prévia do editor — por isso o layout responde à largura do
 * contêiner (@container), não à da janela.
 */
export function LoginScreen({ a, form, children, preview }: { a: LoginAppearance; form: ReactNode; children?: ReactNode; preview?: boolean }) {
  const vars = {
    ...(a.accentColor && {
      "--brand": a.accentColor,
      "--brand-2": `color-mix(in srgb, ${a.accentColor} 86%, black)`,
      "--brand-soft": `color-mix(in srgb, ${a.accentColor} 10%, transparent)`,
    }),
    ...(a.textColor && { "--fg-2": a.textColor }),
  } as CSSProperties;

  return (
    <div className={cx("@container", preview ? "h-full" : "min-h-dvh")} style={vars}>
      <main className={cx("grid bg-surface", preview ? "h-full" : "min-h-dvh", a.showHero && "@5xl:grid-cols-[1fr_1.05fr]")} style={a.formBg ? { background: a.formBg } : undefined}>
        <section className="flex items-center justify-center p-6 @2xl:p-12">
          <div className={cx("w-full max-w-sm", !preview && "animate-in")}>
            {a.showLogo && (
              <div className="mb-12">
                {a.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.logoUrl} alt="Logo" style={{ height: a.logoHeight }} className="w-auto max-w-full object-contain" />
                ) : (
                  <Logo size={a.logoHeight} />
                )}
              </div>
            )}
            <h1 className="font-display text-[28px] font-bold" style={a.titleColor ? { color: a.titleColor } : undefined}>{a.title}</h1>
            {a.showSubtitle && <p className="mt-2 text-sm text-muted" style={a.textColor ? { color: a.textColor } : undefined}>{a.subtitle}</p>}
            <div className="mt-8">{form}</div>
            {children}
          </div>
        </section>

        {a.showHero && (
          <section className="relative m-3 hidden overflow-hidden rounded-[28px] p-12 @5xl:flex @5xl:flex-col @5xl:justify-between" style={{ background: heroBackground(a), color: a.heroTextColor }}>
            {a.showGlow && (
              <>
                <div className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-white/15 blur-3xl" />
                <div className="pointer-events-none absolute -bottom-32 -left-16 size-96 rounded-full bg-[#14a89a]/40 blur-3xl" />
              </>
            )}

            <div className="relative flex items-center gap-2 text-sm font-medium opacity-80">
              {a.showBadge && <><Sparkles className="size-4" /> {a.badgeText}</>}
            </div>

            {a.showCard ? <PreviewCard a={a} /> : <div />}

            <div className="relative max-w-md">
              <h2 className="whitespace-pre-line font-display text-[34px] font-bold leading-[1.15]">{a.headline}</h2>
              {a.showDescription && <p className="mt-3 whitespace-pre-line text-sm leading-relaxed opacity-75">{a.description}</p>}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

/** Cartão ilustrativo de uma OS aprovada (textos e fotos editáveis). */
function PreviewCard({ a }: { a: LoginAppearance }) {
  const steps = loginSteps(a);
  const accent = a.accentColor || "#5b5bd6";
  return (
    <div className="relative mx-auto w-full max-w-md">
      <div className="rounded-2xl bg-white p-5 text-[#0f172a] shadow-[0_30px_60px_-20px_rgb(15_23_42/0.45)]">
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="truncate text-xs font-semibold" style={{ color: accent }}>{a.cardProtocol}</span>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#16a34a]/10 px-2 py-0.5 text-[11px] font-semibold text-[#16a34a]">
            <span className="size-1.5 rounded-full bg-current" /> {a.cardStatus}
          </span>
        </div>
        <p className="font-display text-lg font-bold">{a.cardTitle}</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Photo url={a.beforeImageUrl} label={a.beforeLabel} fallback="linear-gradient(135deg,#8b8577,#5f5a50)" tag="bg-black/50" />
          <Photo url={a.afterImageUrl} label={a.afterLabel} fallback="linear-gradient(135deg,#eef0fe,#c7c9f5)" tag="" tagStyle={{ background: accent }} />
        </div>
        {steps.length > 0 && (
          <ol className="mt-5 flex items-center">
            {steps.map((s, i) => (
              <li key={`${s}-${i}`} className="flex flex-1 items-center last:flex-none">
                <span className="flex flex-col items-center gap-1.5">
                  <span className="flex size-6 items-center justify-center rounded-full text-white" style={{ background: accent }}><Check className="size-3.5" strokeWidth={3} /></span>
                  <span className="whitespace-nowrap text-[10px] font-medium text-[#64748b]">{s}</span>
                </span>
                {i < steps.length - 1 && <span className="mx-1.5 mb-5 h-0.5 flex-1 rounded-full" style={{ background: accent }} />}
              </li>
            ))}
          </ol>
        )}
      </div>
      {a.showToast && (
        <div className="absolute -bottom-3 left-10 flex translate-y-1/2 items-center gap-3 rounded-2xl bg-white px-4 py-3 text-[#0f172a] shadow-[0_20px_40px_-16px_rgb(15_23_42/0.5)]">
          <span className="flex size-9 items-center justify-center rounded-xl bg-[#0e9384]/10 text-[#0e9384]"><ShieldCheck className="size-5" /></span>
          <div className="text-xs">
            <p className="font-semibold">{a.toastTitle}</p>
            <p className="flex items-center gap-1 text-[#64748b]"><Clock className="size-3" /> {a.toastTime}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function Photo({ url, label, fallback, tag, tagStyle }: { url: string; label: string; fallback: string; tag: string; tagStyle?: CSSProperties }) {
  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-xl" style={{ background: fallback }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url && <img src={url} alt={label} className="absolute inset-0 size-full object-cover" />}
      <span className={cx("absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white", tag)} style={tagStyle}>{label}</span>
    </div>
  );
}
