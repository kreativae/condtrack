"use client";

import { startTransition, useActionState, useEffect, useRef, useState, useTransition } from "react";
import { ImagePlus, Loader2, NotebookPen, Trash2, X } from "lucide-react";
import { addChecklistNote, deleteChecklistNote } from "@/app/actions/checklist";
import { processImage } from "@/components/media-uploader";
import { MediaGrid } from "@/components/media-grid";
import { Alert, Card, CardHeader, Textarea, buttonClass, cx } from "@/components/ui";

export type DayNote = { id: string; text: string; photos: string[]; by: string; at: string; deletable: boolean };
export type DayPhoto = { id: string; url: string; caption: string; by: string; at: string };

const MAX_PHOTOS = 8;
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

/** Anotações do dia: texto livre com fotos, registradas com autor e horário. */
export function DayNotes({ notes, condominiumId, date, canWrite }: { notes: DayNote[]; condominiumId: string; date: string; canWrite: boolean }) {
  return (
    <Card>
      <CardHeader title="Anotações do dia" subtitle="Ocorrências, recados e observações, com fotos." />
      {canWrite && <NoteForm key={date} condominiumId={condominiumId} date={date} />}
      <ul className="divide-y divide-line border-t border-line">
        {notes.length ? notes.map((n) => <NoteRow key={n.id} note={n} />) : (
          <li className="flex items-center gap-3 px-5 py-6 text-sm text-muted"><NotebookPen className="size-4" />Nenhuma anotação neste dia.</li>
        )}
      </ul>
    </Card>
  );
}

function NoteForm({ condominiumId, date }: { condominiumId: string; date: string }) {
  const [state, action, pending] = useActionState(addChecklistNote.bind(null, condominiumId, date), undefined);
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  // Salvou: limpa o formulário
  useEffect(() => {
    if (state?.ok) {
      setText("");
      setPhotos([]);
    }
  }, [state]);

  async function upload(files: FileList) {
    setError(null);
    const list = Array.from(files).slice(0, MAX_PHOTOS - photos.length);
    if (files.length > list.length) setError(`No máximo ${MAX_PHOTOS} fotos por anotação.`);
    setBusy((b) => b + list.length);
    for (const f of list) {
      try {
        // Mesmo tratamento das fotos do checklist: comprime no aparelho antes de enviar
        const blob = await processImage(f);
        const fd = new FormData();
        fd.append("file", new File([blob], "anotacao.jpg", { type: blob.type || "image/jpeg" }));
        fd.append("condominiumId", condominiumId);
        const res = await fetch("/api/checklist/photo", { method: "POST", body: fd });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.url) throw new Error(data.error ?? "Falha no envio.");
        setPhotos((p) => [...p, data.url]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Falha no envio da foto.");
      } finally {
        setBusy((b) => b - 1);
      }
    }
    if (input.current) input.current.value = "";
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData();
        fd.set("text", text);
        fd.set("photos", JSON.stringify(photos));
        startTransition(() => action(fd));
      }}
      className="space-y-3 px-5 pb-4 pt-4"
    >
      <Textarea rows={3} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ex.: Portão da garagem fazendo barulho; morador do 302 avisou vazamento no hall." />
      {(photos.length > 0 || busy > 0) && (
        <div className="flex flex-wrap gap-2">
          {photos.map((url) => (
            <div key={url} className="relative size-16 overflow-hidden rounded-lg ring-1 ring-line">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="size-full object-cover" />
              <button type="button" onClick={() => setPhotos((p) => p.filter((x) => x !== url))} aria-label="Tirar foto" className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white">
                <X className="size-3" />
              </button>
            </div>
          ))}
          {Array.from({ length: busy }, (_, i) => (
            <div key={`b${i}`} className="flex size-16 items-center justify-center rounded-lg bg-bg-2 ring-1 ring-line"><Loader2 className="size-4 animate-spin text-muted" /></div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <input ref={input} type="file" accept="image/*" multiple className="hidden" onChange={(e) => e.target.files?.length && upload(e.target.files)} />
        <button type="button" onClick={() => input.current?.click()} disabled={busy > 0 || photos.length >= MAX_PHOTOS} className={buttonClass("ghost", "sm")}>
          <ImagePlus className="size-4" />Fotos
        </button>
        <button type="submit" disabled={pending || busy > 0 || (!text.trim() && !photos.length)} className={cx(buttonClass("brand", "sm"), "ml-auto")}>
          {pending && <Loader2 className="size-3.5 animate-spin" />}Registrar
        </button>
      </div>
      {(error || state?.error) && <Alert>{error ?? state?.error}</Alert>}
    </form>
  );
}

function NoteRow({ note }: { note: DayNote }) {
  const [pending, start] = useTransition();
  const [asking, setAsking] = useState(false);
  return (
    <li className={cx("px-5 py-3.5", pending && "opacity-50")}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-muted"><span className="font-medium text-fg-2">{note.by}</span> às {hhmm(note.at)}</p>
        {note.deletable && (asking ? (
          <span className="flex items-center gap-2 text-xs">
            <button type="button" onClick={() => start(() => deleteChecklistNote(note.id))} className="font-medium text-bad hover:underline">Excluir</button>
            <button type="button" onClick={() => setAsking(false)} className="text-muted hover:underline">Cancelar</button>
          </span>
        ) : (
          <button type="button" onClick={() => setAsking(true)} aria-label="Excluir anotação" className="rounded-lg p-1 text-muted hover:bg-bad/10 hover:text-bad"><Trash2 className="size-3.5" /></button>
        ))}
      </div>
      {note.text && <p className="mt-1 whitespace-pre-line text-sm text-fg-2">{note.text}</p>}
      {note.photos.length > 0 && (
        <div className="mt-2">
          <MediaGrid items={note.photos.map((url, i) => ({ id: `${note.id}-${i}`, url, type: "photo", uploadedAt: note.at, uploadedBy: note.by }))} />
        </div>
      )}
    </li>
  );
}

/** Galeria do dia: fotos das conferências e das anotações, com visualização em tela cheia. */
export function DayGallery({ photos }: { photos: DayPhoto[] }) {
  return (
    <Card>
      <CardHeader title="Galeria do dia" subtitle={photos.length ? `${photos.length} foto(s) das conferências e anotações` : "Fotos das conferências e anotações aparecem aqui."} />
      <div className="p-4">
        {photos.length ? (
          <MediaGrid items={photos.map((p) => ({ id: p.id, url: p.url, type: "photo", uploadedAt: p.at, uploadedBy: `${p.by} · ${p.caption}` }))} />
        ) : (
          <p className="py-4 text-center text-sm text-muted">Nenhuma foto neste dia.</p>
        )}
      </div>
    </Card>
  );
}
