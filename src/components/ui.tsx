import Link from "next/link";
import clsx from "clsx";
import type { ComponentProps, ReactNode } from "react";
import { initials } from "@/lib/format";

export const cx = clsx;

export type Tone = "info" | "warn" | "ok" | "bad" | "muted" | "brand";

const toneClass: Record<Tone, string> = {
  info: "text-info bg-info/10 ring-info/15",
  warn: "text-warn bg-warn/10 ring-warn/15",
  ok: "text-ok bg-ok/10 ring-ok/15",
  bad: "text-bad bg-bad/10 ring-bad/15",
  muted: "text-muted bg-muted/10 ring-muted/15",
  brand: "text-brand bg-brand/10 ring-brand/15",
};

const toneText: Record<Tone, string> = { info: "text-info", warn: "text-warn", ok: "text-ok", bad: "text-bad", muted: "text-muted", brand: "text-brand" };

export function Badge({ tone = "muted", children, dot, className }: { tone?: Tone; children: ReactNode; dot?: boolean; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset", toneClass[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function Card({ className, children, brand, ...rest }: ComponentProps<"div"> & { brand?: boolean }) {
  return (
    <div
      className={cx(
        "rounded-2xl border bg-surface shadow-card",
        brand ? "border-brand/30" : "border-line",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, action, subtitle }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
      <div>
        <h3 className="font-display text-[15px] font-semibold">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-col gap-3 sm:mb-8 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-xs font-semibold first-letter:uppercase text-brand sm:text-sm">{eyebrow}</p>}
        <h1 className="text-balance font-display text-[22px] font-bold leading-tight tracking-tight sm:text-[30px]">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-[13px] text-muted sm:mt-2 sm:text-sm">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2 sm:shrink-0 sm:justify-end">{actions}</div>}
    </header>
  );
}

type Variant = "brand" | "outline" | "ghost" | "danger" | "success";
const variantClass: Record<Variant, string> = {
  brand: "btn-brand font-semibold",
  outline: "border border-line-strong bg-surface font-medium text-fg shadow-card hover:bg-bg-2",
  ghost: "font-medium text-fg-2 hover:bg-bg-2",
  danger: "border border-bad/40 text-bad hover:bg-bad/10",
  success: "bg-ok/90 text-white font-semibold hover:bg-ok",
};
export function buttonClass(variant: Variant = "brand", size: "sm" | "md" = "md") {
  return cx(
    "inline-flex items-center justify-center gap-2 rounded-xl transition disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
    size === "sm" ? "h-8 px-3 text-xs" : "h-10 px-4 text-sm",
    variantClass[variant],
  );
}

export function Button({ variant, size, className, ...rest }: ComponentProps<"button"> & { variant?: Variant; size?: "sm" | "md" }) {
  return <button className={cx(buttonClass(variant, size), className)} {...rest} />;
}

export function LinkButton({ variant, size, className, ...rest }: ComponentProps<typeof Link> & { variant?: Variant; size?: "sm" | "md" }) {
  return <Link className={cx(buttonClass(variant, size), className)} {...rest} />;
}

const fieldBase =
  "w-full rounded-xl border border-line-strong bg-surface px-3.5 text-sm text-fg shadow-card placeholder:text-muted/70 transition focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15";

export function Input(props: ComponentProps<"input">) {
  return <input {...props} className={cx(fieldBase, "h-10", props.className)} />;
}
export function Textarea(props: ComponentProps<"textarea">) {
  return <textarea rows={4} {...props} className={cx(fieldBase, "py-2.5", props.className)} />;
}
export function Select(props: ComponentProps<"select">) {
  return <select {...props} className={cx(fieldBase, "h-10 appearance-none pr-8", props.className)} />;
}

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1.5 block text-[13px] font-medium text-fg-2">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export type StatItem = { label: string; value: ReactNode; hint?: ReactNode; tone?: Tone; trend?: { text: string; good: boolean }; spark?: number[] };

/**
 * Números do painel sem cartão: soltos sobre o fundo, separados por linhas finas, com tendência
 * opcional (texto verde/vermelho) e mini gráfico. Para destacar o que importa, cartão só onde separa algo.
 */
export function StatStrip({ items }: { items: StatItem[] }) {
  return (
    <div className="mb-6 grid grid-cols-2 border-y border-line lg:grid-cols-4">
      {items.map((s, i) => (
        <div key={s.label} className={cx("@container flex flex-col gap-1 px-1 py-4 sm:px-5", i % 2 === 1 && "border-l border-line", i >= 2 && "border-t border-line lg:border-t-0", i === 2 && "lg:border-l")}>
          <p className="text-xs font-medium text-muted sm:text-[13px]">{s.label}</p>
          <div className="flex items-end justify-between gap-2">
            <p className={cx("font-num font-bold tracking-tight tabular-nums text-[26px] @[14rem]:text-[30px]", s.tone ? toneText[s.tone] : "text-fg")}>{s.value}</p>
            {s.spark && s.spark.length > 1 && <Sparkline values={s.spark} />}
          </div>
          {s.trend ? (
            <p className={cx("text-xs font-semibold", s.trend.good ? "text-ok" : "text-bad")}>{s.trend.text}</p>
          ) : (
            s.hint && <p className="text-xs text-muted">{s.hint}</p>
          )}
        </div>
      ))}
    </div>
  );
}

/** Mini gráfico de linha (cor da marca), escalado aos próprios valores. */
export function Sparkline({ values }: { values: number[] }) {
  const w = 76, h = 26, max = Math.max(...values, 1), min = Math.min(...values, 0);
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * (w - 4) + 2).toFixed(1)},${(h - 2 - ((v - min) / (max - min || 1)) * (h - 4)).toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" className="hidden shrink-0 text-brand @[12rem]:block">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: Tone }) {
  return (
    <Card className="@container p-4 sm:p-5">
      <p className="text-xs font-medium leading-snug text-muted [overflow-wrap:anywhere] sm:text-[13px]">{label}</p>
      <p
        className={cx(
          "mt-2 font-num font-bold tracking-tight tabular-nums",
          // O tamanho depende só da largura do cartão: cartões lado a lado têm números do mesmo
          // tamanho, e valores longos (R$ 54.222,40) cabem sem estourar
          "text-lg @[13rem]:text-xl @[15rem]:text-2xl @[18rem]:text-[28px]",
          tone ? toneText[tone] : "text-fg",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </Card>
  );
}

export function Avatar({ name, src, size = 36 }: { name: string; src?: string | null; size?: number }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" width={size} height={size} className="rounded-full object-cover" />
  ) : (
    <span
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-brand-soft font-semibold text-brand"
    >
      {initials(name)}
    </span>
  );
}

export function Empty({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-brand-soft text-brand [&>svg]:size-6">{icon}</div>}
      <p className="font-display text-base font-semibold">{title}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-muted">{children}</div>}
    </div>
  );
}

export function Alert({ tone = "bad", children }: { tone?: Tone; children: ReactNode }) {
  return <div className={cx("rounded-xl px-4 py-3 text-sm ring-1 ring-inset", toneClass[tone])}>{children}</div>;
}
