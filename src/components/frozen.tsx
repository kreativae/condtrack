import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card, buttonClass, cx } from "./ui";

/**
 * Página "congelada": ocupa exatamente a altura da janela e só a lista rola.
 * Desconta cabeçalho (4rem), margens do <main> (2rem + 4rem no desktop) ou a
 * barra inferior no mobile, e as faixas de aviso do layout (--chrome).
 */
export function FrozenPage({ children }: { children: ReactNode }) {
  return (
    // Mobile: 10.5rem = cabeçalho + margem superior + barra inferior; o -mb-10
    // compensa o padding extra do <main> (pb-28) para a página não rolar.
    <div className="-mb-10 flex h-[calc(100dvh-10.5rem-var(--chrome,0px))] min-h-[380px] animate-in flex-col lg:mb-0 lg:h-[calc(100dvh-10rem-var(--chrome,0px))]">
      {children}
    </div>
  );
}

/** Topo fixo (título, abas, filtros). */
export function FrozenTop({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("shrink-0 [&>header]:mb-5", className)}>{children}</div>;
}

/** Card que preenche o espaço restante com rolagem interna e rodapé fixo. */
export function ScrollCard({ children, footer, className }: { children: ReactNode; footer?: ReactNode; className?: string }) {
  return (
    <Card className={cx("flex min-h-0 flex-1 flex-col overflow-hidden", className)}>
      <div className="min-h-0 flex-1 overflow-auto overscroll-contain">{children}</div>
      {footer && <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-line bg-surface px-5 py-3 text-xs text-muted">{footer}</footer>}
    </Card>
  );
}

/**
 * Área rolável para listas de cards soltos (feed, comunicados), com a
 * paginação numa barra fixa embaixo. O px/-mx evita cortar a sombra dos cards.
 */
export function ScrollArea({ children, footer, className }: { children: ReactNode; footer?: ReactNode; className?: string }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className={cx("-mx-1 min-h-0 flex-1 overflow-auto overscroll-contain px-1 pb-1", className)}>{children}</div>
      {footer && (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-5 py-3 text-xs text-muted shadow-card">{footer}</div>
      )}
    </div>
  );
}

/** Cabeçalho de tabela que fica fixo dentro do ScrollCard. */
export const stickyHead = "sticky top-0 z-10 bg-surface shadow-[inset_0_-1px_0_var(--line)]";

/** Paginação padrão (Mostrando X–Y de N · ← 1/3 →). `href` monta o link de cada página. */
export function Pager({ page, pageSize, total, href }: { page: number; pageSize: number; total: number; href: (page: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(total, page * pageSize);
  return (
    <>
      <span>{total ? <>Mostrando <b className="text-fg">{from}–{to}</b> de <b className="text-fg">{total}</b></> : "Nenhum registro"}</span>
      {pages > 1 && (
        <div className="flex items-center gap-2">
          <PageLink href={href(page - 1)} disabled={page <= 1}><ChevronLeft className="size-4" /><span className="hidden sm:inline">Anteriores</span></PageLink>
          <span className="whitespace-nowrap px-1 font-num">{page} / {pages}</span>
          <PageLink href={href(page + 1)} disabled={page >= pages}><span className="hidden sm:inline">Próximos</span><ChevronRight className="size-4" /></PageLink>
        </div>
      )}
    </>
  );
}

function PageLink({ href, disabled, children }: { href: string; disabled: boolean; children: ReactNode }) {
  if (disabled) return <span className={cx(buttonClass("outline", "sm"), "pointer-events-none opacity-40")}>{children}</span>;
  return <Link href={href} className={buttonClass("outline", "sm")}>{children}</Link>;
}

/** Normaliza o número da página a partir da URL. */
export function pageParam(v: string | string[] | undefined, total: number, pageSize: number) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return Math.min(pages, Math.max(1, Number(Array.isArray(v) ? v[0] : v ?? 1) || 1));
}

/** Monta a URL mantendo os filtros atuais e trocando só a página. */
export function withPage(base: string, params: Record<string, string | string[] | undefined>, page: number) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (k === "page" || v == null) continue;
    const val = Array.isArray(v) ? v[0] : v;
    if (val) q.set(k, val);
  }
  if (page > 1) q.set("page", String(page));
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}
