"use client";

import Link from "next/link";
import { startTransition, useActionState, useRef, useState } from "react";
import { AlertTriangle, Camera, Check, Loader2, RotateCcw, X } from "lucide-react";
import { checkItem, uncheckItem, type ChecklistState } from "@/app/actions/checklist";
import { processImage } from "@/components/media-uploader";
import { Alert, Card, CardHeader, Select, Textarea, buttonClass, cx } from "@/components/ui";

export type TodayItem = {
  id: string;
  title: string;
  description: string | null;
  area: string | null;
  check: { status: string; note: string | null; photoUrl: string | null; by: string; at: string; order: { id: string; protocol: string } | null } | null;
};

/** Checklist de hoje: marcar OK ou registrar problema (com foto e abertura de OS). */
export function ChecklistToday({ items, canCheck, condominiumId, title = "Checklist do dia", footer }: { items: TodayItem[]; canCheck: boolean; condominiumId: string; title?: string; footer?: React.ReactNode }) {
  const done = items.filter((i) => i.check).length;
  const issues = items.filter((i) => i.check?.status === "issue").length;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;
  return (
    <Card className="self-start">
      <CardHeader title={title} subtitle={items.length ? `${done} de ${items.length} conferidos${issues ? ` · ${issues} com problema` : ""}` : "Nenhum item para hoje"} />
      {items.length > 0 && (
        <div className="px-5 pt-4">
          <div className="h-1.5 overflow-hidden rounded-full bg-bg-2">
            <div className={cx("h-full rounded-full transition-all", issues ? "bg-warn" : "bg-ok")} style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}
      <ul className="divide-y divide-line">
        {items.map((i) => <Row key={i.id} item={i} canCheck={canCheck} condominiumId={condominiumId} />)}
      </ul>
      {footer && <div className="border-t border-line px-5 py-3">{footer}</div>}
    </Card>
  );
}

function Row({ item, canCheck, condominiumId }: { item: TodayItem; canCheck: boolean; condominiumId: string }) {
  const [reporting, setReporting] = useState(false);
  const [okState, markOk, okPending] = useActionState(checkItem.bind(null, item.id), undefined);
  const [undoState, undo, undoPending] = useActionState(uncheckItem.bind(null, item.id), undefined);
  const c = item.check;
  const error = (okState ?? undoState)?.error;

  return (
    <li className="px-5 py-3.5">
      <div className="flex items-start gap-3">
        <span className={cx("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md ring-1", !c ? "ring-line-strong" : c.status === "ok" ? "bg-ok text-white ring-ok" : "bg-bad text-white ring-bad")}>
          {c?.status === "ok" && <Check className="size-3.5" strokeWidth={3} />}
          {c?.status === "issue" && <AlertTriangle className="size-3" strokeWidth={2.5} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className={cx("text-sm", c?.status === "ok" ? "text-muted" : "font-medium")}>{item.title}</p>
          {(item.area || item.description) && <p className="text-xs text-muted">{[item.area, item.description].filter(Boolean).join(" · ")}</p>}
          {c && (
            <div className="mt-1 space-y-1 text-xs text-muted">
              <p>{c.status === "ok" ? "OK" : "Com problema"} · {c.by} às {new Date(c.at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>
              {c.note && <p className="rounded-lg bg-bg-2 px-2.5 py-1.5 text-fg-2">{c.note}</p>}
              <div className="flex flex-wrap items-center gap-2">
                {c.photoUrl && (
                  <a href={c.photoUrl} target="_blank" rel="noopener" className="block size-12 overflow-hidden rounded-lg ring-1 ring-line">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={c.photoUrl} alt="" className="size-full object-cover" />
                  </a>
                )}
                {c.order && <Link href={`/os/${c.order.id}`} className="font-medium text-brand hover:underline">{c.order.protocol} →</Link>}
              </div>
            </div>
          )}
        </div>
        {canCheck && !reporting && (
          c ? (
            <button type="button" disabled={undoPending} onClick={() => startTransition(() => undo())} title="Desfazer" className="rounded-lg p-1.5 text-muted transition hover:bg-bg-2 hover:text-fg">
              {undoPending ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
            </button>
          ) : (
            <div className="flex shrink-0 gap-1.5">
              <button
                type="button"
                disabled={okPending}
                onClick={() => {
                  const fd = new FormData();
                  fd.set("status", "ok");
                  startTransition(() => markOk(fd));
                }}
                className="inline-flex h-8 items-center gap-1 rounded-lg bg-ok/10 px-2.5 text-xs font-semibold text-ok transition hover:bg-ok/20"
              >
                {okPending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}OK
              </button>
              <button type="button" onClick={() => setReporting(true)} className="inline-flex h-8 items-center gap-1 rounded-lg bg-bad/10 px-2.5 text-xs font-semibold text-bad transition hover:bg-bad/20">
                <AlertTriangle className="size-3.5" />Problema
              </button>
            </div>
          )
        )}
      </div>
      {error && <p className="mt-2 text-xs text-bad">{error}</p>}
      {reporting && <IssueForm itemId={item.id} condominiumId={condominiumId} onClose={() => setReporting(false)} />}
    </li>
  );
}

function IssueForm({ itemId, condominiumId, onClose }: { itemId: string; condominiumId: string; onClose: () => void }) {
  const [photo, setPhoto] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [openOrder, setOpenOrder] = useState(true);
  const file = useRef<HTMLInputElement>(null);
  const [state, run, pending] = useActionState(async (prev: ChecklistState, fd: FormData) => {
    const r = await checkItem(itemId, prev, fd);
    if (r?.ok) onClose();
    return r;
  }, undefined);

  async function upload(f: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const blob = await processImage(f);
      const fd = new FormData();
      fd.append("file", new File([blob], "checklist.jpg", { type: "image/jpeg" }));
      fd.append("condominiumId", condominiumId);
      const res = await fetch("/api/checklist/photo", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) throw new Error(data.error ?? "Falha no envio.");
      setPhoto(data.url);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Falha no envio.");
    } finally {
      setUploading(false);
      if (file.current) file.current.value = "";
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => run(fd));
      }}
      className="mt-3 space-y-3 rounded-xl border border-bad/20 bg-bad/[0.03] p-3"
    >
      <input type="hidden" name="status" value="issue" />
      {photo && <input type="hidden" name="photoUrl" value={photo} />}
      <Textarea name="note" rows={2} maxLength={500} placeholder="O que foi encontrado?" autoFocus />
      <div className="flex flex-wrap items-center gap-2">
        <input ref={file} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        {photo ? (
          <span className="relative block size-14 overflow-hidden rounded-lg ring-1 ring-line">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo} alt="" className="size-full object-cover" />
            <button type="button" onClick={() => setPhoto(null)} className="absolute right-0.5 top-0.5 rounded-md bg-black/60 p-0.5 text-white" aria-label="Remover foto"><X className="size-3" /></button>
          </span>
        ) : (
          <button type="button" disabled={uploading} onClick={() => file.current?.click()} className={buttonClass("outline", "sm")}>
            {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Camera className="size-3.5" />}{uploading ? "Enviando…" : "Foto"}
          </button>
        )}
        <label className="flex items-center gap-2 text-xs font-medium text-fg-2">
          <input type="checkbox" name="openOrder" checked={openOrder} onChange={(e) => setOpenOrder(e.target.checked)} className="size-4 accent-[var(--brand)]" />
          Abrir OS
        </label>
        {openOrder && (
          <Select name="priority" defaultValue="medium" className="h-8 w-auto py-0 text-xs">
            <option value="urgent">Urgente</option>
            <option value="high">Alta</option>
            <option value="medium">Média</option>
            <option value="low">Baixa</option>
          </Select>
        )}
      </div>
      {uploadError && <p className="text-xs text-bad">{uploadError}</p>}
      {state?.error && <Alert>{state.error}</Alert>}
      <div className="flex gap-2">
        <button type="submit" disabled={pending || uploading} className={cx(buttonClass("danger", "sm"), "bg-bad text-white hover:bg-bad/90")}>
          {pending && <Loader2 className="size-3.5 animate-spin" />}Registrar problema
        </button>
        <button type="button" onClick={onClose} className={buttonClass("ghost", "sm")}>Cancelar</button>
      </div>
    </form>
  );
}
