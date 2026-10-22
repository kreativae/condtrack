"use client";

import { useRef, useState, useTransition } from "react";
import { Camera, Check, Loader2, MapPin, PackageCheck, Pencil, ScanText, Undo2, X } from "lucide-react";
import { deliverParcel, moveParcel, receiveParcel, returnParcel, type ParcelState } from "@/app/actions/parcels";
import { useFormSubmit } from "@/components/use-form-submit";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Badge, Button, Field, Input, cx } from "@/components/ui";
import type { UnitOption } from "@/lib/unit-search";
import { UnitPicker } from "./unit-picker";
import { SuggestInput } from "./floating";
import { thumb } from "@/lib/media-url";
import { cleanForOcr, parseLabel, type LabelResident, type LabelUnit } from "@/lib/parcel-label";

/**
 * Reduz a foto no aparelho (lado maior até 1600 px): a versão colorida (JPEG) é a que fica anexada; a versão
 * limpa (preto e branco, endireitada, sem código de barras, ver cleanForOcr) é a que vai para o OCR.
 */
async function preparePhoto(file: File, max = 1600) {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  const w = (canvas.width = Math.round(bmp.width * scale));
  const h = (canvas.height = Math.round(bmp.height * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
  if (!blob) throw new Error("Não foi possível processar a foto.");
  const photo = new File([blob], "etiqueta.jpg", { type: "image/jpeg" });

  const px = ctx.getImageData(0, 0, w, h);
  const gray = new Uint8ClampedArray(w * h);
  for (let i = 0; i < gray.length; i++) gray[i] = (px.data[i * 4] * 299 + px.data[i * 4 + 1] * 587 + px.data[i * 4 + 2] * 114) / 1000;
  const clean = cleanForOcr(gray, w, h);
  for (let i = 0; i < clean.length; i++) {
    px.data[i * 4] = px.data[i * 4 + 1] = px.data[i * 4 + 2] = clean[i];
    px.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(px, 0, 0);
  return { photo, ocr: canvas };
}

/**
 * Receber encomenda. A foto da etiqueta é lida no próprio aparelho (OCR) e preenche unidade, destinatário,
 * transportadora e rastreio para o porteiro conferir. Transportadora e local continuam preenchidos depois de
 * salvar, para registrar várias seguidas (chegou o caminhão dos Correios com 10 pacotes).
 */
export function ReceiveParcelForm({ units, carriers, locations, labelUnits, residents, fixedUnit, onDone }: {
  units: UnitOption[]; carriers: string[]; locations: string[]; labelUnits: LabelUnit[]; residents: LabelResident[];
  /** Aberto pelo cartão da unidade: a unidade já vem escolhida. */
  fixedUnit?: string; onDone?: () => void;
}) {
  const [key, setKey] = useState(0);
  const [unitId, setUnitId] = useState(fixedUnit ?? "");
  const [recipient, setRecipient] = useState("");
  const [description, setDescription] = useState("");
  const [carrier, setCarrier] = useState("");
  const [location, setLocation] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [reading, setReading] = useState<{ step: string; pct: number } | null>(null);
  const [readResult, setReadResult] = useState<{ found: string[]; error?: string } | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);

  function clearPhoto() {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setReadResult(null);
    if (photoInput.current) photoInput.current.value = "";
    if (picker.current) picker.current.value = "";
  }

  const [state, form, pending] = useFormSubmit(async (p: ParcelState, f: FormData) => {
    const r = await receiveParcel(p, f);
    if (r?.ok) {
      setKey((k) => k + 1);
      setUnitId(fixedUnit ?? "");
      setRecipient("");
      setDescription("");
      clearPhoto();
    }
    return r;
  });

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setReadResult(null);
    try {
      setReading({ step: "Preparando a foto…", pct: 0 });
      const { photo: small, ocr } = await preparePhoto(file);
      // A foto reduzida vai no formulário (campo escondido "photo")
      const dt = new DataTransfer();
      dt.items.add(small);
      if (photoInput.current) photoInput.current.files = dt.files;
      if (preview) URL.revokeObjectURL(preview);
      setPreview(URL.createObjectURL(small));

      // OCR no navegador: na primeira vez baixa o leitor e o português (fica no cache)
      setReading({ step: "Lendo a etiqueta…", pct: 0 });
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("por", 1, {
        logger: (m) => m.status === "recognizing text" && setReading({ step: "Lendo a etiqueta…", pct: Math.round(m.progress * 100) }),
      });
      const { data } = await worker.recognize(ocr);
      await worker.terminate();

      const r = parseLabel(data.text, labelUnits, residents);
      if (r.unitId) setUnitId(r.unitId);
      if (r.recipient) setRecipient(r.recipient);
      if (r.carrier) setCarrier(r.carrier);
      if (r.tracking) setDescription((d) => (d ? `${d} · ${r.tracking}` : r.tracking!));
      setReadResult({ found: r.found });
    } catch (e) {
      setReadResult({ found: [], error: e instanceof Error && e.message.includes("processar") ? e.message : "Não deu para ler esta foto (formato não suportado neste navegador). Preencha os campos." });
    } finally {
      setReading(null);
    }
  }

  return (
    // Os campos seguem a largura do cartão (@container), não a da janela: lado a lado com a lista, o cartão é estreito
    <form {...form} className="@container space-y-4">
      <input ref={photoInput} type="file" name="photo" accept="image/*" className="hidden" tabIndex={-1} aria-hidden />
      <input ref={picker} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onPhoto(e.target.files?.[0])} />

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-line p-3">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Foto da etiqueta" className="size-16 rounded-lg object-cover" />
        ) : (
          <span className="flex size-16 items-center justify-center rounded-lg bg-bg-2 text-muted"><Camera className="size-6" /></span>
        )}
        <div className="min-w-0 flex-1 text-sm">
          {reading ? (
            <p className="flex items-center gap-2 text-fg-2"><Loader2 className="size-4 animate-spin" />{reading.step}{reading.pct > 0 && ` ${reading.pct}%`}</p>
          ) : readResult?.error ? (
            <p className="text-warn">{readResult.error}</p>
          ) : readResult ? (
            readResult.found.length ? (
              <p className="text-fg-2"><ScanText className="mr-1 inline size-4 text-ok" />Lido da etiqueta: <b className="font-medium text-fg">{readResult.found.join(", ")}</b>. Confira antes de registrar.</p>
            ) : (
              <p className="text-fg-2">Não achei os dados na etiqueta. A foto fica anexada; preencha os campos.</p>
            )
          ) : (
            <p className="text-muted">Tire uma foto da etiqueta: o sistema tenta preencher unidade, destinatário, transportadora e rastreio.</p>
          )}
        </div>
        <div className="flex gap-1">
          <Button type="button" size="sm" variant="outline" disabled={!!reading} onClick={() => picker.current?.click()}><Camera className="size-4" />{preview ? "Outra foto" : "Foto da etiqueta"}</Button>
          {preview && !reading && <button type="button" onClick={clearPhoto} className="rounded-lg p-1.5 text-muted hover:bg-bg-2" aria-label="Tirar a foto"><X className="size-4" /></button>}
        </div>
      </div>

      <div key={key} className="grid gap-4 @md:grid-cols-2 @3xl:grid-cols-4">
        {fixedUnit ? (
          <input type="hidden" name="unitId" value={fixedUnit} />
        ) : (
          <Field label="Unidade">
            <UnitPicker units={units} name="unitId" value={unitId} onChange={setUnitId} autoFocus={key > 0} />
          </Field>
        )}
        <Field label="Destinatário (opcional)"><Input name="recipient" maxLength={120} value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="Nome no pacote" /></Field>
        <Field label="Descrição ou rastreio (opcional)"><Input name="description" maxLength={200} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Caixa média, envelope, BR123456789" /></Field>
        <Field label="Volumes"><Input name="volumes" type="number" min={1} max={99} defaultValue={1} /></Field>
      </div>
      <div className="grid gap-4 @md:grid-cols-2 @3xl:grid-cols-4">
        <Field label="Transportadora">
          <SuggestInput name="carrier" value={carrier} onChange={setCarrier} options={carriers} placeholder="Correios, Mercado Livre…" />
        </Field>
        <Field label="Onde ficou guardada" hint="Fica preenchido para a próxima.">
          <SuggestInput name="location" value={location} onChange={setLocation} options={locations} placeholder="Armário 3, Prateleira B, Geladeira" />
        </Field>
      </div>
      <PlaceChips locations={locations} value={location} onPick={setLocation} />
      {state?.error && <Alert>{state.error}</Alert>}
      {state?.message && <Alert tone="ok">{state.message}</Alert>}
      <div className="flex gap-2">
        <SubmitButton pending={pending} pendingText="Registrando…" size="sm" disabled={!!reading}><PackageCheck className="size-4" />Registrar e avisar a unidade</SubmitButton>
        {onDone && <Button type="button" variant="ghost" size="sm" onClick={onDone}>Fechar</Button>}
      </div>
    </form>
  );
}

/** Atalhos dos locais de guarda: um toque preenche. Sem locais, explica onde cadastrar. */
export function PlaceChips({ locations, value, onPick }: { locations: string[]; value: string; onPick: (l: string) => void }) {
  if (!locations.length)
    return <p className="-mt-2 text-xs text-muted">Nenhum local cadastrado ainda. O síndico cadastra em Estrutura → Encomendas; os que forem digitados aqui também viram atalho.</p>;
  return (
    <div className="-mt-2 flex flex-wrap items-center gap-1">
      <span className="mr-1 text-xs text-muted">Locais:</span>
      {locations.slice(0, 12).map((l) => (
        <button key={l} type="button" onClick={() => onPick(l)} className={cx("rounded-full px-2.5 py-1 text-xs font-medium transition", value === l ? "bg-brand text-brand-ink" : "bg-bg-2 text-fg-2 hover:bg-line")}>{l}</button>
      ))}
    </div>
  );
}

export type ParcelRowData = {
  id: string; unit: string; recipient: string | null; what: string; volumes: number; location: string | null; photo: string | null;
  wait: string; overdue: boolean; receivedBy: string; receivedAt: string;
};

/** Encomenda aguardando: local (dá para trocar), tempo de espera, entregar ou devolver. */
export function ParcelRow({ p, locations }: { p: ParcelRowData; locations: string[] }) {
  const [mode, setMode] = useState<"deliver" | "return" | "move" | null>(null);
  const [loc, setLoc] = useState(p.location ?? "");
  const [moving, startMove] = useTransition();
  const [dState, dForm, dPending] = useFormSubmit((s: ParcelState, f: FormData) => deliverParcel(p.id, s, f));
  const [rState, rForm, rPending] = useFormSubmit((s: ParcelState, f: FormData) => returnParcel(p.id, s, f));
  return (
    <li className="px-5 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {p.photo && (
          <a href={p.photo} target="_blank" rel="noreferrer" title="Ver a foto" className="shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={thumb(p.photo, 480)} alt="" className="size-11 rounded-lg object-cover ring-1 ring-line" />
          </a>
        )}
        {/* Texto com largura mínima: em coluna estreita, os botões descem juntos para a linha de baixo */}
        <div className="min-w-48 flex-1">
          <p className="text-sm font-semibold">{p.unit}{p.recipient && <span className="font-normal text-fg-2"> · {p.recipient}</span>}</p>
          <p className="text-xs text-muted">{[p.what, p.volumes > 1 && `${p.volumes} volumes`, `recebida ${p.receivedAt} por ${p.receivedBy}`].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={() => setMode(mode === "move" ? null : "move")} title="Trocar o local" className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-brand/10 px-2.5 py-1 text-xs font-semibold text-brand hover:bg-brand/15">
            <MapPin className="size-3" />{p.location ?? "Sem local"}
          </button>
          <Badge tone={p.overdue ? "bad" : "muted"}>{p.wait}</Badge>
          <Button size="sm" variant={mode === "deliver" ? "brand" : "outline"} onClick={() => setMode(mode === "deliver" ? null : "deliver")}><Check className="size-3.5" />Entregar</Button>
          <button type="button" onClick={() => setMode(mode === "return" ? null : "return")} title="Devolver ou cancelar" className="rounded-lg p-1.5 text-muted hover:bg-bg-2 hover:text-fg"><Undo2 className="size-4" /></button>
        </div>
      </div>

      {mode === "deliver" && (
        <form {...dForm} className="mt-3 flex flex-wrap items-end gap-2 rounded-xl bg-bg-2 p-3">
          <Field label="Retirada por" className="min-w-52 flex-1"><Input name="deliveredTo" required minLength={2} maxLength={120} defaultValue={p.recipient ?? ""} autoFocus placeholder="Nome de quem retirou" /></Field>
          <SubmitButton pending={dPending} pendingText="Salvando…" size="sm">Confirmar entrega</SubmitButton>
          <Button type="button" variant="ghost" size="sm" onClick={() => setMode(null)}>Cancelar</Button>
          {dState?.error && <p className="basis-full text-xs text-bad">{dState.error}</p>}
        </form>
      )}
      {mode === "return" && (
        <form {...rForm} className="mt-3 flex flex-wrap items-end gap-2 rounded-xl bg-bg-2 p-3">
          <Field label="Motivo" className="min-w-52 flex-1"><Input name="reason" required minLength={3} maxLength={300} autoFocus placeholder="Devolvida ao remetente, registrada por engano…" /></Field>
          <SubmitButton pending={rPending} pendingText="Salvando…" size="sm" variant="danger">Marcar como devolvida</SubmitButton>
          <Button type="button" variant="ghost" size="sm" onClick={() => setMode(null)}>Cancelar</Button>
          {rState?.error && <p className="basis-full text-xs text-bad">{rState.error}</p>}
        </form>
      )}
      {mode === "move" && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-bg-2 p-3">
          <Input value={loc} onChange={(e) => setLoc(e.target.value)} list="parcel-locations" maxLength={60} className="w-56" placeholder="Novo local" autoFocus />
          <Button size="sm" disabled={moving} onClick={() => startMove(async () => { await moveParcel(p.id, loc); setMode(null); })}>
            {moving ? <Loader2 className="size-3.5 animate-spin" /> : <Pencil className="size-3.5" />}Salvar local
          </Button>
          <button type="button" onClick={() => setMode(null)} className="rounded-lg p-1.5 text-muted hover:bg-bg-2" aria-label="Fechar"><X className="size-4" /></button>
          <datalist id="parcel-locations">{locations.map((l) => <option key={l} value={l} />)}</datalist>
        </div>
      )}
    </li>
  );
}
