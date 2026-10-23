"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, FileUp, Loader2, Paperclip, Plus, Search, X } from "lucide-react";
import { quickSupplier, saveQuote, type SupplierState } from "@/app/actions/suppliers";
import { Sheet } from "@/components/portaria/gate-actions";
import { Alert, Button, Field, FieldGroup, Input, cx } from "@/components/ui";
import { CategoryIcon } from "@/components/suppliers/look";
import { dateToDay, fmtSize } from "@/lib/finance";
import { MAX_QUOTE_FILES, QUOTE_FILE_TYPES, SUPPLIER_CATEGORIES } from "@/lib/suppliers";
import { pickQuoteFiles, uploadQuoteFiles } from "./quote-form";

type Sup = { id: string; name: string; category: string | null };
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const plusDays = (n: number) => dateToDay(new Date(Date.now() + n * 86_400_000));

/**
 * Orçamento rápido: botão do topo e "soltar o arquivo em qualquer lugar da página". Arquivo, fornecedor
 * (busca ou cadastra na hora), serviço e valor numa gaveta só; o resto fica em "Mais detalhes".
 */
export function QuickQuote({ suppliers, titles, label = "Orçamento" }: { suppliers: Sup[]; titles: string[]; label?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [list, setList] = useState(suppliers);
  const [supplier, setSupplier] = useState<Sup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<string | null>(null);

  const addFiles = (fl: FileList | null) => {
    const { ok, bad } = pickQuoteFiles(fl, files.length);
    setFiles((cur) => [...cur, ...ok].slice(0, MAX_QUOTE_FILES));
    setError(bad.length ? bad.join("; ") : null);
  };

  // Arrastar um arquivo para a página abre a gaveta com ele
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes("Files");
    const enter = (e: DragEvent) => { if (hasFiles(e)) { depth++; setDragging(true); } };
    const leave = (e: DragEvent) => { if (hasFiles(e) && --depth <= 0) { depth = 0; setDragging(false); } };
    const over = (e: DragEvent) => { if (hasFiles(e)) e.preventDefault(); };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      if ((e.target as HTMLElement | null)?.closest?.("[data-dropzone]")) return; // a área da gaveta trata
      addFiles(e.dataTransfer?.files ?? null);
      setOpen(true);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  });

  function close() {
    if (step) return;
    setOpen(false);
    setFiles([]);
    setSupplier(null);
    setError(null);
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!supplier) return setError("Escolha ou cadastre o fornecedor.");
    setError(null);
    setStep("Salvando…");
    const fd = new FormData(e.currentTarget);
    fd.set("supplierId", supplier.id);
    const res: SupplierState = await saveQuote(null, undefined, fd).catch(() => ({ error: "Não foi possível salvar. Tente de novo." }));
    if (!res?.ok || !res.id) {
      setError(res?.error ?? "Não foi possível salvar.");
      setStep(null);
      return;
    }
    const errors = files.length ? await uploadQuoteFiles(res.id, files, (n) => setStep(`Enviando arquivos (${n}/${files.length})…`)) : [];
    router.push(`/fornecedores/orcamento/${res.id}${errors.length ? `?falhou=${errors.length}` : ""}`);
    router.refresh();
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}><Plus className="size-4" />{label}</Button>

      {dragging && !open && (
        <div className="pointer-events-none fixed inset-0 z-40 grid place-items-center bg-brand/10 p-6 backdrop-blur-[2px]">
          <div className="rounded-3xl border-2 border-dashed border-brand bg-surface px-10 py-8 text-center shadow-pop">
            <FileUp className="mx-auto mb-2 size-10 text-brand" />
            <p className="font-display text-lg font-semibold">Solte para cadastrar o orçamento</p>
            <p className="text-sm text-muted">PDF ou foto, até 8 MB</p>
          </div>
        </div>
      )}

      <Sheet open={open} onClose={close} title="Novo orçamento">
        <form onSubmit={submit} className="space-y-4">
          <DropZone files={files} onAdd={addFiles} onRemove={(i) => setFiles(files.filter((_, j) => j !== i))} />

          <SupplierPicker
            list={list}
            value={supplier}
            onChange={setSupplier}
            onCreated={(s) => { setList((l) => [...l, s].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))); setSupplier(s); }}
          />

          <div className="grid gap-3 sm:grid-cols-[1.5fr_1fr]">
            <Field label="Serviço ou material" hint="Mesmo nome = aparece no comparador.">
              <Input name="title" required minLength={2} maxLength={140} list="qq-titles" placeholder="Ex.: Pintura da fachada" />
              <datalist id="qq-titles">{titles.map((t) => <option key={t} value={t} />)}</datalist>
            </Field>
            <Field label="Valor (R$)">
              <Input name="amount" required inputMode="decimal" placeholder="0,00" className="text-lg font-semibold tabular-nums" />
            </Field>
          </div>

          <ValidityField />

          <details className="group rounded-2xl ring-1 ring-line">
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium text-fg-2">
              Mais detalhes <span className="text-xs font-normal text-muted">prazo, pagamento, o que está incluso</span>
              <ChevronDown className="size-4 transition group-open:rotate-180" />
            </summary>
            <div className="space-y-3 px-4 pb-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Prazo de execução"><Input name="deadline" maxLength={80} placeholder="Ex.: 15 dias úteis" /></Field>
                <Field label="Pagamento"><Input name="paymentTerms" maxLength={120} placeholder="Ex.: 50% + 50% na entrega" /></Field>
              </div>
              <Field label="O que está incluso">
                <textarea name="description" rows={3} maxLength={3000} className="w-full rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-sm text-fg shadow-card focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15" />
              </Field>
            </div>
          </details>

          {error && <Alert>{error}</Alert>}
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={close} disabled={!!step}>Cancelar</Button>
            <Button type="submit" disabled={!!step}>
              {step ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              {step ?? "Cadastrar e avisar o síndico"}
            </Button>
          </div>
        </form>
      </Sheet>
    </>
  );
}

function DropZone({ files, onAdd, onRemove }: { files: File[]; onAdd: (f: FileList | null) => void; onRemove: (i: number) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div>
      <div
        data-dropzone
        role="button"
        tabIndex={0}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); onAdd(e.dataTransfer.files); }}
        className={cx(
          "flex cursor-pointer items-center gap-4 rounded-2xl border-2 border-dashed px-4 py-4 transition",
          over ? "border-brand bg-brand/5" : "border-line-strong hover:border-brand/60 hover:bg-bg-2",
        )}
      >
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand"><FileUp className="size-5" /></span>
        <span className="min-w-0">
          <span className="block text-sm font-medium">{files.length ? "Anexar mais" : "Arraste o PDF ou a foto do orçamento"}</span>
          <span className="block text-xs text-muted">ou toque para escolher · no celular, dá para fotografar</span>
        </span>
      </div>
      <input ref={input} type="file" accept={Object.keys(QUOTE_FILE_TYPES).join(",")} multiple hidden onChange={(e) => { onAdd(e.target.files); e.target.value = ""; }} />
      {files.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {files.map((f, i) => (
            <span key={i} className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-bg-2 py-1 pl-2.5 pr-1 text-xs">
              <Paperclip className="size-3 shrink-0 text-muted" />
              <span className="truncate">{f.name}</span>
              <span className="text-muted">{fmtSize(f.size)}</span>
              <button type="button" onClick={() => onRemove(i)} className="rounded-full p-0.5 text-muted hover:bg-surface hover:text-bad" aria-label={`Tirar ${f.name}`}><X className="size-3.5" /></button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Busca na agenda; sem resultado, cadastra ali mesmo (nome, ramo e telefone). */
function SupplierPicker({ list, value, onChange, onCreated }: { list: Sup[]; value: Sup | null; onChange: (s: Sup | null) => void; onCreated: (s: Sup) => void }) {
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [cat, setCat] = useState("");
  const [phone, setPhone] = useState("");
  const found = useMemo(() => {
    const w = norm(q.trim());
    return (w ? list.filter((s) => norm(`${s.name} ${s.category ?? ""}`).includes(w)) : list).slice(0, 6);
  }, [q, list]);

  if (value) {
    return (
      <FieldGroup label="Fornecedor">
        <div className="flex items-center gap-3 rounded-2xl bg-bg-2 px-3 py-2.5">
          <CategoryIcon category={value.category} size="sm" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{value.name}</span>
            {value.category && <span className="block text-xs text-muted">{value.category}</span>}
          </span>
          <button type="button" onClick={() => { onChange(null); setQ(""); }} className="text-xs font-medium text-brand hover:underline">Trocar</button>
        </div>
      </FieldGroup>
    );
  }

  if (creating) {
    return (
      <FieldGroup label="Novo fornecedor">
        <div className="space-y-2 rounded-2xl p-3 ring-1 ring-brand/40">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome do fornecedor" autoFocus />
          <div className="grid gap-2 sm:grid-cols-2">
            <Input value={cat} onChange={(e) => setCat(e.target.value)} list="qq-cats" placeholder="Ramo (ex.: Pintura)" />
            <datalist id="qq-cats">{SUPPLIER_CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="tel" placeholder="Telefone / WhatsApp" />
          </div>
          {err && <p className="text-xs text-bad">{err}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setCreating(false)}>Voltar</Button>
            <Button
              type="button"
              size="sm"
              disabled={busy || q.trim().length < 2}
              onClick={async () => {
                setBusy(true);
                const r = await quickSupplier({ name: q, category: cat, phone }).catch(() => ({ error: "Não foi possível cadastrar." }));
                setBusy(false);
                if ("supplier" in r && r.supplier) { onCreated(r.supplier); setCreating(false); }
                else setErr(r.error ?? "Não foi possível cadastrar.");
              }}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}Adicionar à agenda
            </Button>
          </div>
        </div>
      </FieldGroup>
    );
  }

  return (
    <FieldGroup label="Fornecedor">
      <div className="rounded-2xl ring-1 ring-line-strong focus-within:ring-2 focus-within:ring-brand">
        <label className="flex items-center gap-2 px-3">
          <Search className="size-4 shrink-0 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar na agenda…" className="h-11 min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-muted/70" />
        </label>
        <div className="max-h-56 overflow-y-auto border-t border-line p-1">
          {found.map((s) => (
            <button key={s.id} type="button" onClick={() => onChange(s)} className="flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left transition hover:bg-bg-2">
              <CategoryIcon category={s.category} size="sm" />
              <span className="min-w-0 flex-1 truncate text-sm">{s.name}</span>
              {s.category && <span className="shrink-0 text-xs text-muted">{s.category}</span>}
            </button>
          ))}
          <button type="button" onClick={() => setCreating(true)} className="flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left text-sm font-medium text-brand transition hover:bg-bg-2">
            <span className="grid size-8 place-items-center rounded-lg bg-brand/10"><Plus className="size-4" /></span>
            {q.trim() ? `Cadastrar “${q.trim()}”` : "Cadastrar fornecedor novo"}
          </button>
        </div>
      </div>
    </FieldGroup>
  );
}

/** Validade com atalhos (15, 30, 60 dias) ou data escolhida */
function ValidityField() {
  const [day, setDay] = useState("");
  const chips: [string, number][] = [["15 dias", 15], ["30 dias", 30], ["60 dias", 60]];
  return (
    <FieldGroup label="Válido até">
      <div className="flex flex-wrap items-center gap-2">
        {chips.map(([l, n]) => {
          const v = plusDays(n);
          return (
            <button key={n} type="button" onClick={() => setDay(day === v ? "" : v)} className={cx("rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition", day === v ? "bg-brand-soft text-brand ring-brand" : "text-fg-2 ring-line-strong hover:bg-bg-2")}>
              {l}
            </button>
          );
        })}
        <Input name="validUntil" type="date" value={day} onChange={(e) => setDay(e.target.value)} className="w-auto flex-1 basis-40" />
      </div>
    </FieldGroup>
  );
}
