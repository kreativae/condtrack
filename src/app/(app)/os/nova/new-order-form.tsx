"use client";

import { useFormSubmit } from "@/components/use-form-submit";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, X } from "lucide-react";
import { createOrder } from "@/app/actions/orders";
import { Alert, Field, Input, Select, Textarea, cx } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

type Opt = { id: string; name: string; condominiumId?: string };
type Props = {
  role: string;
  condos: Opt[];
  categories: Opt[];
  areas: Opt[];
  units: { id: string; label: string; condominiumId?: string }[];
  defaultUnitId?: string;
};

const PRIORITIES = [
  ["urgent", "Urgente", "bg-bad"],
  ["high", "Alta", "bg-warn"],
  ["medium", "Média", "bg-info"],
  ["low", "Baixa", "bg-muted"],
] as const;

export function NewOrderForm({ role, condos, categories: allCategories, areas: allAreas, units: allUnits, defaultUnitId }: Props) {
  const router = useRouter();
  // Superadmin escolhe o condomínio; as listas abaixo são filtradas por ele
  const [condo, setCondo] = useState(condos.length === 1 ? condos[0].id : "");
  const byCondo = <T extends { condominiumId?: string }>(list: T[]) => (role === "superadmin" ? list.filter((x) => x.condominiumId === condo) : list);
  const categories = byCondo(allCategories);
  const areas = byCondo(allAreas);
  const units = byCondo(allUnits);
  const [state, form, pending] = useFormSubmit(createOrder);
  const [loc, setLoc] = useState<"common_area" | "unit">(role === "council" && units.length ? "unit" : "common_area");
  const [priority, setPriority] = useState("medium");
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Após criar a OS, envia as fotos da ocorrência e abre o detalhe.
  useEffect(() => {
    if (!state?.id) return;
    const id = state.id;
    (async () => {
      for (let i = 0; i < files.length; i++) {
        setUploading(`Enviando foto ${i + 1} de ${files.length}…`);
        const fd = new FormData();
        fd.append("file", files[i]);
        fd.append("meta", JSON.stringify({ takenAt: new Date().toISOString() }));
        await fetch(`/api/upload/${id}?phase=opening`, { method: "POST", body: fd }).catch(() => null);
      }
      router.push(`/os/${id}`);
    })();
  }, [state?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const busy = !!uploading || !!state?.id;

  return (
    <form {...form} className="space-y-6">
      {role === "superadmin" && (
        <Field label="Condomínio">
          <Select name="condominiumId" required value={condo} onChange={(e) => setCondo(e.target.value)}>
            <option value="" disabled>Selecione…</option>
            {condos.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
      )}
      <Field label={role === "council" ? "O que está acontecendo?" : "Título"}>
        <Input name="title" required minLength={4} maxLength={120} placeholder="Ex.: Lâmpada queimada no corredor do 5º andar" />
      </Field>
      <Field label="Descrição detalhada">
        <Textarea name="description" required minLength={10} placeholder="Onde fica, desde quando, o que você observou…" />
      </Field>

      <div className="grid gap-6 sm:grid-cols-2">
        <Field label="Categoria">
          <Select key={condo} name="categoryId" defaultValue="">
            <option value="">Não sei / Outra</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        {role !== "council" && (
          <Field label="Prazo desejado" hint="Se vazio, calculado pela prioridade.">
            <Input type="date" name="dueDate" min={new Date().toISOString().slice(0, 10)} />
          </Field>
        )}
      </div>

      <fieldset>
        <legend className="mb-1.5 text-[13px] font-medium text-fg-2">Prioridade</legend>
        <input type="hidden" name="priority" value={priority} />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PRIORITIES.map(([k, label, dot]) => (
            <button key={k} type="button" onClick={() => setPriority(k)} className={cx("flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition", priority === k ? "border-brand bg-brand/10 text-fg" : "border-line text-muted hover:text-fg")}>
              <span className={cx("size-2 rounded-full", dot)} />{label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-1.5 text-[13px] font-medium text-fg-2">Local</legend>
        <input type="hidden" name="locationType" value={loc} />
        <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl bg-bg-2 p-1 text-sm">
          {([["common_area", "Área comum"], ["unit", "Unidade"]] as const).map(([k, l]) => (
            <button key={k} type="button" disabled={k === "unit" && !units.length} onClick={() => setLoc(k)} className={cx("rounded-lg py-2 transition disabled:opacity-40", loc === k ? "bg-surface text-brand shadow-card" : "text-muted")}>
              {l}
            </button>
          ))}
        </div>
        {loc === "common_area" ? (
          <Select key={condo} name="commonAreaId" required defaultValue="">
            <option value="" disabled>Selecione a área…</option>
            {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        ) : (
          <Select key={condo} name="unitId" required defaultValue={defaultUnitId ?? ""}>
            <option value="" disabled>Selecione a unidade…</option>
            {units.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
          </Select>
        )}
        <Input name="locationNote" className="mt-2" placeholder="Complemento (ex.: próximo ao elevador social)" maxLength={200} />
      </fieldset>

      <div>
        <p className="mb-1.5 text-[13px] font-medium text-fg-2">Fotos da ocorrência</p>
        <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => setFiles((f) => [...f, ...Array.from(e.target.files ?? [])].slice(0, 10))} />
        <div className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <div key={i} className="relative size-20 overflow-hidden rounded-xl ring-1 ring-line">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={URL.createObjectURL(f)} alt="" className="size-full object-cover" />
              <button type="button" onClick={() => setFiles((fs) => fs.filter((_, j) => j !== i))} className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white" aria-label="Remover">
                <X className="size-3" />
              </button>
            </div>
          ))}
          {files.length < 10 && (
            <button type="button" onClick={() => fileInput.current?.click()} className="flex size-20 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line-strong text-brand transition hover:bg-brand/5">
              <ImagePlus className="size-5" strokeWidth={1.5} />
              <span className="text-[10px]">Adicionar</span>
            </button>
          )}
        </div>
      </div>

      {state?.error && <Alert>{state.error}</Alert>}
      <div className="flex items-center justify-end gap-3 border-t border-line pt-6">
        {uploading && <span className="flex items-center gap-2 text-sm text-muted"><Loader2 className="size-4 animate-spin" />{uploading}</span>}
        <SubmitButton pending={pending} disabled={busy} pendingText="Criando…">{role === "council" ? "Enviar solicitação" : "Abrir ordem de serviço"}</SubmitButton>
      </div>
    </form>
  );
}
