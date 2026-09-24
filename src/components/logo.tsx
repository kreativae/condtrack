import { cx } from "./ui";

/**
 * Marca Condtrack: casa em traço contínuo cujo interior é um check —
 * "condomínio" + "serviço verificado". O traçado arredondado deixa a marca amigável.
 */
export function LogoMark({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cx("logo-mark inline-flex shrink-0 items-center justify-center shadow-[0_4px_12px_-4px_rgb(91_91_214/0.6)]", className)}
      style={{ width: size, height: size, borderRadius: size * 0.3 }}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" width={size * 0.62} height={size * 0.62} fill="none" stroke="#fff" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 10.2 12 4l8 6.2V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7.8Z" strokeWidth="2" />
        <path d="m8.6 13.4 2.4 2.4 4.6-4.6" strokeWidth="2.2" />
      </svg>
    </span>
  );
}

export function Logo({ compact, size = 34, tagline = true, invert }: { compact?: boolean; size?: number; tagline?: boolean; invert?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={size} />
      {!compact && (
        <span className="leading-none">
          <span className={cx("font-display text-[19px] font-bold", invert ? "text-white" : "text-fg")}>
            Cond<span className={invert ? "text-white/70" : "text-brand"}>track</span>
          </span>
          {tagline && <span className={cx("mt-1 block text-[10px] font-medium", invert ? "text-white/60" : "text-muted")}>Gestão condominial</span>}
        </span>
      )}
    </span>
  );
}
