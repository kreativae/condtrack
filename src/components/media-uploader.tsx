"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, Upload } from "lucide-react";
import clsx from "clsx";

const MAX_SIDE = 1920;
const JPEG_QUALITY = 0.82;
const MAX_VIDEO_SECONDS = 120;

type Props = {
  orderId: string;
  phase: "opening" | "before" | "during" | "after";
  remaining: number;
  compact?: boolean;
};

function getPosition(): Promise<GeolocationCoordinates | null> {
  if (!("geolocation" in navigator)) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition((p) => resolve(p.coords), () => resolve(null), { timeout: 4000, maximumAge: 60_000 });
  });
}

/**
 * Redimensiona e comprime. Sem texto sobre a foto: data, local, GPS e aparelho
 * ficam nos metadados (card "Metadados dos registros" na OS).
 */
export async function processImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Falha ao processar imagem"))), "image/jpeg", JPEG_QUALITY));
}

function videoDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(v.src);
      resolve(v.duration);
    };
    v.onerror = () => resolve(0);
    v.src = URL.createObjectURL(file);
  });
}

export function MediaUploader({ orderId, phase, remaining, compact }: Props) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handle(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const list = [...files].slice(0, remaining);
    if (files.length > remaining) setError(`Apenas ${remaining} arquivo(s) restante(s) nesta etapa.`);

    const coords = await getPosition();
    const now = new Date();
    const geo = coords ? `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}` : null;

    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      setBusy(`Enviando ${i + 1} de ${list.length}…`);
      try {
        const fd = new FormData();
        const meta: Record<string, unknown> = { takenAt: now.toISOString(), geo, originalSize: f.size };
        if (f.type.startsWith("video/")) {
          const d = await videoDuration(f);
          if (d > MAX_VIDEO_SECONDS) throw new Error(`“${f.name}” tem mais de 2 minutos.`);
          meta.duration = d;
          fd.append("file", f);
        } else if (f.type.startsWith("image/")) {
          const blob = await processImage(f);
          fd.append("file", new File([blob], f.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }));
        } else {
          throw new Error(`Formato não suportado: ${f.name}`);
        }
        fd.append("meta", JSON.stringify(meta));
        const res = await fetch(`/api/upload/${orderId}?phase=${phase}`, { method: "POST", body: fd });
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Falha no envio");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Falha no envio");
        break;
      }
    }
    setBusy(null);
    if (input.current) input.current.value = "";
    router.refresh();
  }

  const disabled = !!busy || remaining <= 0;
  return (
    <div>
      <input ref={input} type="file" accept="image/*,video/mp4,video/webm,video/quicktime" multiple hidden onChange={(e) => handle(e.target.files)} />
      <button
        type="button"
        disabled={disabled}
        onClick={() => input.current?.click()}
        className={clsx(
          "group flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong bg-brand/[0.03] text-center transition hover:bg-brand/[0.07] disabled:cursor-not-allowed disabled:opacity-60",
          compact ? "px-4 py-4" : "px-6 py-8",
        )}
      >
        {busy ? <Loader2 className="size-6 animate-spin text-brand" /> : (
          <span className="flex gap-2 text-brand">
            <Camera className="size-5" strokeWidth={1.5} />
            <Upload className="size-5" strokeWidth={1.5} />
          </span>
        )}
        <span className="text-sm font-medium">{busy ?? (remaining > 0 ? "Tirar foto ou enviar arquivos" : "Limite de arquivos atingido")}</span>
        {!busy && remaining > 0 && <span className="text-xs text-muted">Fotos e vídeos (até 2 min) · {remaining} restante(s) · marca d’água automática</span>}
      </button>
      {error && <p className="mt-2 text-xs text-bad">{error}</p>}
    </div>
  );
}
