"use client";

import { useMemo, useRef, useState, type KeyboardEvent, type Ref } from "react";
import { Building2, X } from "lucide-react";
import { cx } from "@/components/ui";
import { matchUnits, type UnitOption } from "@/lib/unit-search";
import { FloatingList } from "./floating";

/**
 * Unidade digitando ("502", "a502", "aurora 502") em vez de uma lista de centenas de opções.
 * Setas escolhem, Enter confirma (com um resultado só, Enter já confirma). Grava o id em um campo escondido `name`.
 * `onEnter` é chamado quando a escolha foi feita pelo Enter (recebimento em lote: registra direto).
 */
export function UnitPicker({ units, name, value, onChange, onEnter, placeholder = "Unidade (502, A502, aurora 502)", autoFocus, big, inputRef, className, allowEmptyLabel }: {
  units: UnitOption[]; name?: string; value?: string; onChange?: (id: string) => void; onEnter?: (id: string) => void;
  placeholder?: string; autoFocus?: boolean; big?: boolean; inputRef?: Ref<HTMLInputElement>; className?: string;
  /** Texto da opção "sem unidade" (ex.: "Condomínio"); sem ela, não há opção vazia. */
  allowEmptyLabel?: string;
}) {
  const [internal, setInternal] = useState("");
  const selected = value ?? internal;
  const current = units.find((u) => u.id === selected);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const matches = useMemo(() => matchUnits(text, units), [text, units]);
  const wrap = useRef<HTMLDivElement>(null);

  function choose(id: string, viaEnter = false) {
    if (value === undefined) setInternal(id);
    onChange?.(id);
    setText("");
    setOpen(false);
    setHi(0);
    if (viaEnter) onEnter?.(id);
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHi((h) => Math.min(h + 1, Math.max(0, matches.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHi((h) => Math.max(0, h - 1));
    } else if (e.key === "Enter") {
      // Enter nunca envia o formulário daqui: escolhe a unidade destacada
      if (text) {
        e.preventDefault();
        const pick = matches[hi] ?? (matches.length === 1 ? matches[0] : null);
        if (pick) choose(pick.id, true);
      } else if (current && onEnter) {
        e.preventDefault();
        onEnter(current.id);
      }
    } else if (e.key === "Escape") {
      // Com a lista aberta, o Esc só fecha a lista (não a gaveta em volta)
      if (open && text) e.stopPropagation();
      setOpen(false);
      setText("");
    } else if (e.key === "Backspace" && !text && current) {
      // Apagar com a unidade escolhida volta a digitar
      choose("");
    }
  }

  return (
    <div ref={wrap} className={cx("relative", className)}>
      {name && <input type="hidden" name={name} value={selected} />}
      <Building2 className={cx("pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted", big ? "size-5" : "size-4")} />
      <input
        ref={inputRef}
        value={text || (open ? "" : current?.label ?? "")}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setHi(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={onKey}
        autoFocus={autoFocus}
        autoComplete="off"
        inputMode="text"
        placeholder={current ? current.label : placeholder}
        aria-label="Unidade"
        className={cx(
          "w-full rounded-xl border border-line bg-surface pr-9 text-fg outline-none transition placeholder:text-muted focus:border-brand focus:ring-2 focus:ring-brand/15",
          big ? "h-12 pl-10 text-base" : "h-10 pl-9 text-sm",
          current && !text && "font-semibold",
        )}
      />
      {current && !text && (
        <button type="button" onClick={() => choose("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-muted hover:bg-bg-2" aria-label="Limpar unidade"><X className="size-4" /></button>
      )}
      <FloatingList anchor={wrap} open={open && !!(text || allowEmptyLabel)}>
          {allowEmptyLabel && !text && (
            <li><button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => choose("")} className="w-full px-3 py-2 text-left text-sm text-fg-2 hover:bg-bg-2">{allowEmptyLabel}</button></li>
          )}
          {matches.map((u, i) => (
            <li key={u.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(u.id)}
                onMouseEnter={() => setHi(i)}
                className={cx("w-full px-3 py-2 text-left text-sm", i === hi ? "bg-brand/10 font-semibold text-brand" : "text-fg-2 hover:bg-bg-2")}
              >
                {u.label}
              </button>
            </li>
          ))}
          {text && !matches.length && <li className="px-3 py-2 text-sm text-muted">Nenhuma unidade com “{text}”.</li>}
      </FloatingList>
    </div>
  );
}
