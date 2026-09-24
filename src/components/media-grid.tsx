"use client";

import { useState } from "react";
import { Play, Trash2, X } from "lucide-react";
import { deleteMedia } from "@/app/actions/orders";

type Media = { id: string; url: string; type: string; uploadedAt: string; uploadedBy: string; deletable?: boolean };

export function MediaGrid({ items }: { items: Media[] }) {
  const [open, setOpen] = useState<Media | null>(null);
  if (!items.length) return null;
  return (
    <>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {items.map((m) => (
          <div key={m.id} className="group relative aspect-square overflow-hidden rounded-xl bg-bg-2 ring-1 ring-line">
            <button type="button" onClick={() => setOpen(m)} className="size-full">
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
              <form action={deleteMedia.bind(null, m.id)} className="absolute right-1.5 top-1.5 opacity-0 transition group-hover:opacity-100">
                <button aria-label="Remover" className="rounded-lg bg-black/60 p-1.5 text-white hover:bg-bad">
                  <Trash2 className="size-3.5" />
                </button>
              </form>
            )}
          </div>
        ))}
      </div>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" onClick={() => setOpen(null)}>
          <button className="absolute right-4 top-4 rounded-full p-2 text-white/80 hover:text-white" aria-label="Fechar">
            <X className="size-6" />
          </button>
          <div className="max-h-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
            {open.type === "video" ? (
              <video src={open.url} controls autoPlay className="max-h-[85vh] rounded-xl" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={open.url} alt="" className="max-h-[85vh] rounded-xl object-contain" />
            )}
            <p className="mt-3 text-center text-xs text-white/70">
              Enviado por {open.uploadedBy} · {new Date(open.uploadedAt).toLocaleString("pt-BR")}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
