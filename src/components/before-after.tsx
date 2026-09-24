"use client";

import { useState } from "react";
import { ChevronsLeftRight } from "lucide-react";

/** Comparação lado a lado com divisor arrastável. */
export function BeforeAfter({ before, after, alt }: { before: string; after: string; alt: string }) {
  const [pos, setPos] = useState(50);
  return (
    <div className="relative aspect-[16/10] w-full select-none overflow-hidden rounded-2xl bg-bg-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={after} alt={`${alt} — depois`} className="absolute inset-0 size-full object-cover" draggable={false} />
      <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={before} alt={`${alt} — antes`} className="absolute inset-0 size-full object-cover" draggable={false} />
      </div>
      <span className="absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">Antes</span>
      <span className="absolute right-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-[#0f172a] backdrop-blur">Depois</span>
      <div className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.08)]" style={{ left: `${pos}%` }}>
        <span className="absolute left-1/2 top-1/2 flex size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-[#5b5bd6] shadow-[0_4px_14px_rgb(0_0_0/0.25)]">
          <ChevronsLeftRight className="size-4" strokeWidth={2.4} />
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={pos}
        onChange={(e) => setPos(Number(e.target.value))}
        aria-label="Comparar antes e depois"
        className="absolute inset-0 size-full cursor-ew-resize opacity-0"
      />
    </div>
  );
}
