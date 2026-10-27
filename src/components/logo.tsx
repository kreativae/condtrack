import { cx } from "./ui";

/**
 * Marca Condtrack, "Andares": três andares que sobem em escada (prédio e progresso) e o traço de conferido no alto
 * (serviço verificado). Desenho numa grade de 64; o quadro é o gradiente da marca (`.logo-mark`, segue a Aparência).
 * O mesmo desenho gera os ícones em `public/` e `src/app/` (`scripts/brand-icons.mjs`).
 */
export const MARK_FLOORS = [
  { x: 15, y: 38, w: 34 },
  { x: 15, y: 26.5, w: 24 },
  { x: 15, y: 15, w: 13.5 },
] as const;
export const MARK_CHECK = "M34.5 19.5l4.2 4.2 9-9.2";

/** Desenho do símbolo sem o quadro: andares em `ink`, conferido em `accent`. */
export function MarkShapes({ ink = "#fff", accent = "var(--mark-accent)" }: { ink?: string; accent?: string }) {
  // translate: centraliza na vertical (o traço de conferido sobe acima do andar de cima)
  return (
    <g transform="translate(0 2.2)">
      {MARK_FLOORS.map((f) => <rect key={f.y} x={f.x} y={f.y} width={f.w} height={9} rx={4.5} fill={ink} />)}
      <path d={MARK_CHECK} fill="none" stroke={accent} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}

export function LogoMark({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cx("logo-mark inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size, borderRadius: size * 0.28 }}
      aria-hidden
    >
      <svg viewBox="0 0 64 64" width={size} height={size}>
        <MarkShapes />
      </svg>
    </span>
  );
}

/** Nome em minúsculas (fonte da marca); "track" na cor da marca, ou no verde de conferido sobre fundo colorido. */
export function Logo({ compact, size = 34, tagline = true, invert }: { compact?: boolean; size?: number; tagline?: boolean; invert?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={size} />
      {!compact && (
        <span className="leading-none">
          <span className={cx("font-brand text-[20px] font-bold tracking-[-0.035em]", invert ? "text-white" : "text-fg")}>
            cond<span className={invert ? "text-[var(--mark-accent)]" : "text-brand"}>track</span>
          </span>
          {tagline && <span className={cx("mt-1 block text-[10px] font-medium", invert ? "text-white/60" : "text-muted")}>Gestão condominial</span>}
        </span>
      )}
    </span>
  );
}
