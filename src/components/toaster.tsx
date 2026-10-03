"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Info, X } from "lucide-react";
import { cx } from "./ui";

type Toast = { id: number; message: string; tone: "ok" | "info" };

const COOKIE = "flash";

/** Lê e apaga o aviso deixado pela última ação (cookie "flash", gravado por lib/flash.ts). */
function takeFlash(): Omit<Toast, "id"> | null {
  const raw = document.cookie.split("; ").find((c) => c.startsWith(`${COOKIE}=`));
  if (!raw) return null;
  document.cookie = `${COOKIE}=; path=/; max-age=0`;
  try {
    const v = JSON.parse(decodeURIComponent(raw.slice(COOKIE.length + 1))) as { message?: string; tone?: string };
    return v.message ? { message: v.message, tone: v.tone === "info" ? "info" : "ok" } : null;
  } catch {
    return null;
  }
}

/** Avisos rápidos no canto da tela ("OS aprovada…"). Somem sozinhos em 4 s. */
export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    queueMicrotask(() => setMounted(true));
    const check = () => {
      const t = takeFlash();
      if (!t) return;
      const id = Date.now();
      setToasts((list) => [...list.slice(-2), { ...t, id }]);
      window.setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), 4000);
    };
    check();
    // A action grava o cookie na resposta; confere com frequência (leitura local, sem rede)
    const timer = window.setInterval(check, 500);
    return () => window.clearInterval(timer);
  }, []);

  if (!mounted) return null;
  return createPortal(
    <div aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-24 z-[60] flex flex-col items-center gap-2 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:items-end lg:bottom-6">
      {toasts.map((t) => (
        <div key={t.id} role="status" className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl bg-fg px-4 py-3 text-sm text-bg shadow-pop animate-in">
          <span className={cx("flex size-6 shrink-0 items-center justify-center rounded-full", t.tone === "ok" ? "bg-ok" : "bg-brand")}>
            {t.tone === "ok" ? <Check className="size-3.5 text-white" strokeWidth={3} /> : <Info className="size-3.5 text-white" strokeWidth={2.5} />}
          </span>
          <span className="flex-1 font-medium">{t.message}</span>
          <button type="button" onClick={() => setToasts((l) => l.filter((x) => x.id !== t.id))} aria-label="Fechar aviso" className="inline-flex size-7 items-center justify-center rounded-lg opacity-70 hover:opacity-100">
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}
