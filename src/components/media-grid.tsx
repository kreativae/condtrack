"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Loader2, Play, Trash2, X } from "lucide-react";
import { deleteMedia } from "@/app/actions/orders";
import { cx } from "./ui";

type Media = { id: string; url: string; type: string; uploadedAt: string; uploadedBy: string; deletable?: boolean };

export function MediaGrid({ items }: { items: Media[] }) {
  const [index, setIndex] = useState<number | null>(null);
  if (!items.length) return null;
  // Após excluir, a lista encolhe quando a página atualiza: mantém o índice válido
  const current = index != null ? Math.min(index, items.length - 1) : null;
  const open = current != null ? items[current] : null;
  return (
    <>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {items.map((m, i) => (
          <div key={m.id} className="group relative aspect-square overflow-hidden rounded-xl bg-bg-2 ring-1 ring-line">
            <button type="button" onClick={() => setIndex(i)} className="size-full" aria-label="Ampliar">
              {m.type === "video" ? (
                <>
                  <video src={m.url} className="size-full object-cover" muted preload="metadata" />
                  <Play className="absolute left-1/2 top-1/2 size-8 -translate-x-1/2 -translate-y-1/2 text-white drop-shadow" />
                </>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.url} alt="" loading="lazy" className="size-full object-cover transition duration-500 group-hover:scale-105" />
              )}
            </button>
            {m.deletable && (
              // Com mouse aparece ao passar por cima; em telas de toque fica sempre visível
              <div className="absolute right-1.5 top-1.5 transition [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:focus-within:opacity-100">
                <DeleteMedia id={m.id} compact />
              </div>
            )}
          </div>
        ))}
      </div>
      {open && (
        <Lightbox
          items={items}
          index={current!}
          onIndex={setIndex}
          onClose={() => setIndex(null)}
        />
      )}
    </>
  );
}

/**
 * Visualização em tela cheia. Vai para o <body> via portal: dentro da página,
 * um ancestral com transform (animação de entrada) prenderia o `fixed` a ele.
 */
function Lightbox({ items, index, onIndex, onClose }: { items: Media[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const m = items[index];
  const many = items.length > 1;
  const go = (d: number) => onIndex((index + d + items.length) % items.length);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (many && e.key === "ArrowRight") onIndex((index + 1) % items.length);
      if (many && e.key === "ArrowLeft") onIndex((index - 1 + items.length) % items.length);
    };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [index, items.length, many, onClose, onIndex]);

  return createPortal(
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[100] flex flex-col bg-black pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]" onClick={onClose}>
      <div className="flex items-center gap-2 px-3 py-3 text-white" onClick={(e) => e.stopPropagation()}>
        <p className="min-w-0 flex-1 truncate text-xs text-white/70">
          {many && <span className="mr-2 font-medium text-white">{index + 1}/{items.length}</span>}
          Enviado por {m.uploadedBy} · {new Date(m.uploadedAt).toLocaleString("pt-BR")}
        </p>
        {m.deletable && <DeleteMedia key={m.id} id={m.id} onDone={() => (items.length > 1 ? onIndex(index === items.length - 1 ? index - 1 : index) : onClose())} />}
        <button type="button" onClick={onClose} className="rounded-full p-2 text-white/80 hover:bg-white/10 hover:text-white" aria-label="Fechar">
          <X className="size-6" />
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-3 pb-4">
        {m.type === "video" ? (
          <video key={m.id} src={m.url} controls autoPlay playsInline className="max-h-full max-w-full rounded-xl" onClick={(e) => e.stopPropagation()} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={m.id} src={m.url} alt="" className="max-h-full max-w-full rounded-xl object-contain" onClick={(e) => e.stopPropagation()} />
        )}
        {many && (
          <>
            <NavButton side="left" onClick={() => go(-1)} />
            <NavButton side="right" onClick={() => go(1)} />
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

function NavButton({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cx("absolute top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2.5 text-white backdrop-blur hover:bg-white/20", side === "left" ? "left-3" : "right-3")}
      aria-label={side === "left" ? "Anterior" : "Próxima"}
    >
      <Icon className="size-6" />
    </button>
  );
}

/** Exclusão em dois passos (sem confirm() nativo). */
function DeleteMedia({ id, compact, onDone }: { id: string; compact?: boolean; onDone?: () => void }) {
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  function run() {
    start(async () => {
      const r = await deleteMedia(id);
      if (r.error) setError(r.error);
      else {
        setAsking(false);
        onDone?.();
      }
    });
  }

  if (pending) {
    return <span className="flex rounded-lg bg-black/60 p-1.5 text-white"><Loader2 className="size-3.5 animate-spin" /></span>;
  }
  if (asking) {
    return (
      <span onClick={stop} className="flex items-center gap-1 rounded-lg bg-black/80 p-1 text-xs text-white">
        <button type="button" onClick={run} className="rounded-md bg-bad px-2 py-1 font-semibold">Excluir</button>
        <button type="button" onClick={() => setAsking(false)} className="rounded-md px-2 py-1 hover:bg-white/10">{compact ? <X className="size-3.5" /> : "Cancelar"}</button>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-2" onClick={stop}>
      {error && <span className="rounded-md bg-bad px-2 py-1 text-[11px] text-white">{error}</span>}
      <button
        type="button"
        onClick={() => setAsking(true)}
        aria-label="Excluir arquivo"
        className={cx("flex items-center gap-1.5 rounded-lg text-white transition hover:bg-bad", compact ? "bg-black/60 p-1.5" : "bg-white/10 px-3 py-2 text-sm")}
      >
        <Trash2 className={compact ? "size-3.5" : "size-4"} />
        {!compact && "Excluir"}
      </button>
    </span>
  );
}
