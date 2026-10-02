"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Settings } from "lucide-react";
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

  // Fecha ao clicar fora ou apertar Esc
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
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
      {open && (
        <div className="absolute right-0 top-12 z-30 w-72 overflow-hidden rounded-2xl border border-line bg-surface shadow-pop animate-in">
          <div className="border-b border-line px-4 py-3">
            <p className="text-sm font-semibold">Personalizar painel</p>
            <p className="text-xs text-muted">Escolha o que aparece no seu painel.</p>
          </div>
          <ul className="max-h-80 overflow-y-auto py-1">
            {sections.map((s) => {
              const on = !hidden.includes(s.key);
              return (
                <li key={s.key}>
                  <button type="button" onClick={() => toggle(s.key)} role="menuitemcheckbox" aria-checked={on} className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-bg-2">
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
        </div>
      )}
    </div>
  );
}
