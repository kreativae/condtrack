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
    <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <p className="mb-1.5 text-sm font-medium first-letter:uppercase text-brand">{eyebrow}</p>}
        <h1 className="font-display text-2xl font-bold leading-tight sm:text-[32px]">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
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

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: Tone }) {
  return (
    <Card className="p-4 sm:p-5">
      <p className="text-xs font-medium leading-snug text-muted [overflow-wrap:anywhere] sm:text-[13px]">{label}</p>
      <p className={cx("mt-2 font-num text-2xl font-bold tracking-tight tabular-nums sm:text-[28px]", tone ? toneText[tone] : "text-fg")}>{value}</p>
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
