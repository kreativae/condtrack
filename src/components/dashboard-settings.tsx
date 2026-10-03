"use client";

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Check, Loader2, Settings, X } from "lucide-react";
import { saveDashboardHidden } from "@/app/actions/nav";
import type { DashSection } from "@/lib/dashboard";
import { cx } from "./ui";

/** Ícone de ajustes do painel: escolher quais blocos aparecem (salvo na conta). */
export function DashboardSettings({ sections, hidden: initial }: { sections: DashSection[]; hidden: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(initial);
  const [pending, start] = useTransition();
  const box = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  // Posição do painel no computador (preso dentro da tela); no celular vira folha no rodapé
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [mobile, setMobile] = useState(false);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const small = window.innerWidth < 640;
      setMobile(small);
      const r = box.current?.getBoundingClientRect();
      if (!r || small) return setPos(null);
      const width = 288;
      const left = Math.min(Math.max(16, r.right - width), window.innerWidth - width - 16);
      setPos({ top: r.bottom + 8, left });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  // Fecha ao clicar fora ou apertar Esc
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (box.current?.contains(t) || panel.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function save(next: string[]) {
    setHidden(next);
    start(async () => {
      await saveDashboardHidden(next);
      router.refresh();
    });
  }
  const toggle = (k: string) => save(hidden.includes(k) ? hidden.filter((x) => x !== k) : [...hidden, k]);

  // Conteúdo do painel (o mesmo na folha do celular e no menu do computador)
  const content = (listHeight: string) => (
    <>
      <div className="border-b border-line px-4 py-3 pr-14">
        <p className="text-sm font-semibold">Personalizar painel</p>
        <p className="text-xs text-muted">Escolha o que aparece no seu painel.</p>
      </div>
      <ul className={cx(listHeight, "overflow-y-auto py-1")}>
        {sections.map((s) => {
          const on = !hidden.includes(s.key);
          return (
            <li key={s.key}>
              <button type="button" onClick={() => toggle(s.key)} role="menuitemcheckbox" aria-checked={on} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-bg-2">
                <span className={cx("flex size-4 shrink-0 items-center justify-center rounded border transition", on ? "border-brand bg-brand text-brand-ink" : "border-line-strong")}>
                  {on && <Check className="size-3" strokeWidth={3} />}
                </span>
                <span className={cx(!on && "text-muted")}>{s.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {hidden.length > 0 && (
        <div className="border-t border-line px-4 py-2.5">
          <button type="button" onClick={() => save([])} className="text-xs font-medium text-brand hover:underline">Mostrar tudo</button>
        </div>
      )}
    </>
  );

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Personalizar painel"
        title="Personalizar painel"
        // Botão quadrado com a mesma altura do botão ao lado (sem o px-4 do buttonClass, que espremia o ícone)
        className={cx(
          "inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-line-strong bg-surface text-fg-2 shadow-card transition hover:bg-bg-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
          open && "bg-bg-2 text-fg",
        )}
      >
        {pending ? (
          <Loader2 className="size-5 shrink-0 animate-spin" />
        ) : (
          // Engrenagem; gira um pouco ao abrir o painel de ajustes
          <Settings className={cx("size-5 shrink-0 transition-transform duration-300", open && "rotate-90")} strokeWidth={1.75} />
        )}
      </button>
      {/* Portal no <body>: a animação de entrada da página prende elementos "fixed" dentro dela */}
      {open && createPortal(
        mobile ? (
          <div className="fixed inset-0 z-50 flex items-end" role="dialog" aria-modal="true" aria-label="Personalizar painel">
            <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
            <div ref={panel} className="relative w-full overflow-hidden rounded-t-3xl bg-surface pb-[env(safe-area-inset-bottom)] shadow-pop animate-in">
              <button type="button" onClick={() => setOpen(false)} aria-label="Fechar" className="absolute right-3 top-3 inline-flex size-9 items-center justify-center rounded-xl text-fg-2 hover:bg-bg-2"><X className="size-5" /></button>
              {content("max-h-[60dvh]")}
            </div>
          </div>
        ) : (
          pos && (
            <div ref={panel} style={{ top: pos.top, left: pos.left }} className="fixed z-50 w-72 overflow-hidden rounded-2xl border border-line bg-surface shadow-pop animate-in">
              {content("max-h-80")}
            </div>
          )
        ),
        document.body,
      )}
    </div>
  );
}
