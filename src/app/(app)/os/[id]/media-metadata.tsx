import { Camera, Clock, MapPin, Smartphone, Upload, Video } from "lucide-react";
import { Card, CardHeader } from "@/components/ui";
import { DELETED_USER, fmtDateTime } from "@/lib/format";
import { PHASE_LABEL, type Phase } from "@/lib/workflow";

type Item = { id: string; url: string; type: string; phase: string; sizeBytes: number; metadata: string; uploadedAt: Date; uploadedBy: { name: string } | null };
type Meta = { takenAt?: string; geo?: string | null; originalSize?: number; duration?: number; watermarked?: boolean; originalName?: string; device?: string | null };

const size = (b?: number) => (b == null ? null : b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const parse = (s: string): Meta => {
  try {
    return JSON.parse(s) ?? {};
  } catch {
    return {};
  }
};

/**
 * Metadados de cada foto/vídeo (os mesmos da marca d'água, e mais): quando foi
 * capturado, por quem e de onde foi enviado, coordenadas GPS e tamanho.
 */
export function MediaMetadata({ items, stamp }: { items: Item[]; stamp: string }) {
  if (!items.length) return null;
  return (
    <Card>
      <CardHeader title="Metadados dos registros" subtitle={`${items.length} arquivo(s) · ${stamp}`} />
      <ul className="divide-y divide-line">
        {items.map((m) => {
          const meta = parse(m.metadata);
          const coords = meta.geo?.split(",").map((x) => x.trim());
          return (
            <li key={m.id} className="flex gap-3 px-5 py-4">
              <div className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-bg-2 ring-1 ring-line">
                {m.type === "video" ? (
                  <Video className="absolute left-1/2 top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 text-muted" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.url} alt="" loading="lazy" className="size-full object-cover" />
                )}
              </div>
              <dl className="min-w-0 flex-1 space-y-1 text-xs">
                <dt className="flex items-center gap-1.5 text-[13px] font-medium text-fg">
                  {m.type === "video" ? "Vídeo" : "Foto"} · {PHASE_LABEL[m.phase as Phase] ?? m.phase}
                  {meta.watermarked && <span className="rounded bg-ok/10 px-1.5 py-px text-[10px] font-semibold text-ok">marca d&apos;água</span>}
                </dt>
                <Row icon={Camera} label="Capturado">{meta.takenAt ? fmtDateTime(new Date(meta.takenAt)) : "—"}</Row>
                <Row icon={Upload} label="Enviado">{fmtDateTime(m.uploadedAt)} por {m.uploadedBy?.name ?? DELETED_USER}</Row>
                <Row icon={MapPin} label="GPS">
                  {coords?.length === 2 ? (
                    <a href={`https://www.google.com/maps?q=${encodeURIComponent(coords.join(","))}`} target="_blank" rel="noopener noreferrer" className="font-mono text-brand hover:underline">
                      {coords.join(", ")}
                    </a>
                  ) : (
                    <span className="text-muted">não informado (localização negada ou indisponível)</span>
                  )}
                </Row>
                {meta.device && <Row icon={Smartphone} label="Aparelho">{meta.device}</Row>}
                <Row icon={Clock} label="Arquivo">
                  {[size(m.sizeBytes), meta.originalSize && meta.originalSize !== m.sizeBytes ? `original ${size(meta.originalSize)}` : null, meta.duration ? `${Math.round(meta.duration)}s` : null].filter(Boolean).join(" · ")}
                </Row>
              </dl>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function Row({ icon: Icon, label, children }: { icon: typeof Camera; label: string; children: React.ReactNode }) {
  return (
    <dd className="flex gap-1.5 text-fg-2">
      <Icon className="mt-px size-3.5 shrink-0 text-muted" />
      <span className="min-w-0 break-words"><span className="text-muted">{label}: </span>{children}</span>
    </dd>
  );
}
