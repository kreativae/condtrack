"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, Lock, X } from "lucide-react";
import { createTicket, type TicketState } from "@/app/actions/tickets";
import { processImage } from "@/components/media-uploader";
import { TicketKindIcon } from "@/components/tickets/look";
import { Alert, Button, Field, FieldGroup, Input, Select, Textarea, cx } from "@/components/ui";
import { MAX_TICKET_PHOTOS, TICKET_KINDS, type TicketKind } from "@/lib/tickets";

type Opt = { id: string; label: string };

const PLACEHOLDER: Record<TicketKind, [string, string]> = {
  problem: ["Ex.: Lâmpada queimada no hall da Torre B", "Onde fica, desde quando, o que você observou…"],
  complaint: ["Ex.: Limpeza da piscina não foi feita", "Conte o que aconteceu, quando e como afeta você…"],
  neighbor: ["Ex.: Barulho depois das 22h no 8º andar", "Descreva a situação com datas e horários. O síndico trata com discrição."],
  suggestion: ["Ex.: Bicicletário coberto na garagem", "Qual a ideia e como ela ajudaria os moradores…"],
  other: ["Ex.: Dúvida sobre a taxa extra", "Escreva o seu pedido ou dúvida…"],
};

/** Envia as fotos uma a uma, já reduzidas no aparelho. Devolve quantas falharam. */
async function uploadPhotos(id: string, files: File[], onStep: (n: number) => void) {
  let failed = 0;
  for (const [i, f] of files.entries()) {
    const body = new FormData();
    const blob = await processImage(f).catch(() => f);
    body.append("file", new File([blob], f.name.replace(/\.\w+$/, "") + ".jpg", { type: blob.type || "image/jpeg" }));
    const res = await fetch(`/api/chamados/${id}/fotos`, { method: "POST", body }).catch(() => null);
    if (!res?.ok) failed++;
    onStep(i + 1);
  }
  return failed;
}

export function TicketForm({ areas, units }: { areas: Opt[]; units: Opt[] }) {
  const router = useRouter();
  const [kind, setKind] = useState<TicketKind | null>(null);
  const [where, setWhere] = useState<"common_area" | "unit" | "none">("none");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!kind) return setError("Escolha o tipo do chamado.");
    setError(null);
    setStep("Enviando…");
    const res: TicketState = await createTicket(undefined, new FormData(e.currentTarget)).catch(() => ({ error: "Não foi possível enviar. Tente de novo." }));
    if (!res?.ok || !res.id) {
      setError(res?.error ?? "Não foi possível enviar.");
      setStep(null);
      return;
    }
    const failed = files.length ? await uploadPhotos(res.id, files, (n) => setStep(`Enviando fotos (${n}/${files.length})…`)) : 0;
    router.push(`/chamados/${res.id}${failed ? `?falhou=${failed}` : ""}`);
    router.refresh();
  }

  const ph = PLACEHOLDER[kind ?? "other"];
  return (
    <form onSubmit={submit} className="space-y-6">
      <FieldGroup label="Sobre o que é?">
        <input type="hidden" name="kind" value={kind ?? ""} />
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {(Object.keys(TICKET_KINDS) as TicketKind[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              aria-pressed={kind === k}
              className={cx("flex items-center gap-3 rounded-2xl p-3 text-left ring-1 transition", kind === k ? "bg-brand-soft ring-2 ring-brand" : "bg-surface ring-line hover:ring-line-strong")}
            >
              <TicketKindIcon kind={k} />
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{TICKET_KINDS[k].label}</span>
                <span className="block text-xs text-muted">{TICKET_KINDS[k].hint}</span>
              </span>
            </button>
          ))}
        </div>
      </FieldGroup>

      <Field label="Assunto">
        <Input name="title" required minLength={4} maxLength={120} placeholder={ph[0]} />
      </Field>
      <Field label="Detalhes">
        <Textarea name="description" required minLength={10} maxLength={4000} rows={5} placeholder={ph[1]} />
      </Field>

      <FieldGroup label="Onde?">
        <input type="hidden" name="locationType" value={where} />
        <div className="mb-3 grid grid-cols-3 gap-1 rounded-xl bg-bg-2 p-1 text-sm">
          {([["common_area", "Área comum"], ["unit", "Minha unidade"], ["none", "Não se aplica"]] as const).map(([k, l]) => (
            <button key={k} type="button" disabled={(k === "unit" && !units.length) || (k === "common_area" && !areas.length)} onClick={() => setWhere(k)} className={cx("rounded-lg px-1 py-2 transition disabled:opacity-40", where === k ? "bg-surface text-brand shadow-card" : "text-muted hover:text-fg")}>
              {l}
            </button>
          ))}
        </div>
        {where === "common_area" && (
          <Select name="commonAreaId" required defaultValue="">
            <option value="" disabled>Escolha a área…</option>
            {areas.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </Select>
        )}
        {where === "unit" && (units.length > 1 ? (
          <Select name="unitId" required defaultValue={units[0].id}>
            {units.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
          </Select>
        ) : (
          <><input type="hidden" name="unitId" value={units[0]?.id ?? ""} /><p className="flex h-10 items-center rounded-xl bg-bg-2 px-3.5 text-sm font-medium">{units[0]?.label}</p></>
        ))}
        {where !== "none" && <Input name="locationNote" className="mt-2" maxLength={200} placeholder="Complemento (ex.: perto do elevador social)" />}
      </FieldGroup>

      <FieldGroup label="Fotos" hint={`Opcional, até ${MAX_TICKET_PHOTOS}. Ajudam o síndico a entender o problema.`}>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          hidden
          onChange={(e) => {
            const picked = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith("image/"));
            setFiles((fs) => [...fs, ...picked].slice(0, MAX_TICKET_PHOTOS));
            e.target.value = "";
          }}
        />
        <div className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <div key={i} className="relative size-20 overflow-hidden rounded-xl ring-1 ring-line">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={URL.createObjectURL(f)} alt="" className="size-full object-cover" />
              <button type="button" onClick={() => setFiles((fs) => fs.filter((_, j) => j !== i))} className="absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-surface/90 text-fg shadow-card" aria-label="Tirar foto">
                <X className="size-3" />
              </button>
            </div>
          ))}
          {files.length < MAX_TICKET_PHOTOS && (
            <button type="button" onClick={() => input.current?.click()} className="flex size-20 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line-strong text-brand transition hover:bg-brand/5">
              <ImagePlus className="size-5" strokeWidth={1.5} />
              <span className="text-[10px]">Adicionar</span>
            </button>
          )}
        </div>
      </FieldGroup>

      {error && <Alert>{error}</Alert>}
      <div className="flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-1.5 text-xs text-muted"><Lock className="size-3.5" />Só você e o síndico veem este chamado.</p>
        <Button type="submit" disabled={!!step}>
          {step && <Loader2 className="size-4 animate-spin" />}
          {step ?? "Enviar chamado"}
        </Button>
      </div>
    </form>
  );
}
