"use client";

import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Input, cx } from "@/components/ui";

/**
 * Lista de sugestões que flutua sobre a página (portal no <body>, posição fixa junto do campo).
 * Dentro de gavetas e janelas com rolagem, uma lista "absolute" ficava cortada pela borda.
 * Abre para cima quando falta espaço embaixo.
 */
export function FloatingList({ anchor, open, children, className }: { anchor: RefObject<HTMLElement | null>; open: boolean; children: ReactNode; className?: string }) {
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number; maxHeight: number } | null>(null);
  const frame = useRef(0);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const el = anchor.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const below = window.innerHeight - r.bottom - 8;
      const above = r.top - 8;
      const up = below < 220 && above > below;
      setPos({
        left: r.left,
        width: r.width,
        ...(up ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
        maxHeight: Math.min(288, Math.max(120, up ? above : below)),
      });
    };
    const schedule = () => {
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(place);
    };
    place();
    // Captura: acompanha a rolagem de qualquer contêiner (a gaveta rola por dentro)
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame.current);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
    };
  }, [open, anchor]);

  if (!open || !pos) return null;
  return createPortal(
    <ul
      style={{ position: "fixed", left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight }}
      className={cx("z-[60] overflow-y-auto rounded-xl border border-line bg-surface py-1 shadow-pop", className)}
    >
      {children}
    </ul>,
    document.body,
  );
}

/**
 * Campo de texto livre com sugestões que aparecem ao clicar (lugares de guarda, transportadoras).
 * Diferente do <datalist>, mostra a lista inteira ao focar e filtra enquanto digita; setas e Enter escolhem.
 */
export function SuggestInput({ value, onChange, options, name, placeholder, maxLength = 60, className }: {
  value: string; onChange: (v: string) => void; options: string[]; name?: string; placeholder?: string; maxLength?: number; className?: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const [typed, setTyped] = useState(false);
  const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  // Ao focar mostra tudo; depois de digitar, só o que contém o texto
  const shown = typed && value.trim() ? options.filter((o) => fold(o).includes(fold(value.trim()))) : options;
  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
    setTyped(false);
    setHi(-1);
  };

  return (
    <div ref={wrap} className={cx("relative", className)}>
      <Input
        name={name}
        value={value}
        maxLength={maxLength}
        autoComplete="off"
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setTyped(true);
          setOpen(true);
          setHi(-1);
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setHi((h) => Math.min(h + 1, shown.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHi((h) => Math.max(0, h - 1));
          } else if (e.key === "Enter" && open && hi >= 0 && shown[hi]) {
            e.preventDefault();
            pick(shown[hi]);
          } else if (e.key === "Escape" && open) {
            e.stopPropagation();
            setOpen(false);
          }
        }}
      />
      <FloatingList anchor={wrap} open={open && shown.length > 0}>
        {shown.map((o, i) => (
          <li key={o}>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(o)}
              onMouseEnter={() => setHi(i)}
              className={cx("w-full px-3 py-2 text-left text-sm", i === hi || o === value ? "bg-brand/10 font-semibold text-brand" : "text-fg-2 hover:bg-bg-2")}
            >
              {o}
            </button>
          </li>
        ))}
      </FloatingList>
    </div>
  );
}
