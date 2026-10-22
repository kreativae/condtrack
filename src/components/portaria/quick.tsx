"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, CheckCheck, DoorOpen, Loader2, PackageCheck, PackagePlus, Search, UserPlus, Users, X } from "lucide-react";
import { deliverUnitParcels, receiveParcel, type ParcelState } from "@/app/actions/parcels";
import { useFormSubmit } from "@/components/use-form-submit";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Button, Field, Input, cx } from "@/components/ui";
import { CARRIERS } from "@/lib/parcels";
import { matchUnits, type UnitOption } from "@/lib/unit-search";
import type { LabelResident, LabelUnit } from "@/lib/parcel-label";
import { UnitPicker } from "./unit-picker";
import { EntryForm, GrantForm } from "./people";
import { ReceiveParcelForm } from "./parcels";
import type { PersonKind } from "@/lib/booking";

/**
 * Barra rápida da portaria: unidade ("502", "aurora 502") abre o cartão da unidade; nome busca pessoas.
 * A tecla "/" volta para ela de qualquer lugar da página.
 */
export function QuickBar({ units, initial }: { units: UnitOption[]; initial?: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(initial ?? "");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const matches = useMemo(() => (/\d/.test(text) || text.trim().length >= 3 ? matchUnits(text, units, 6) : []), [text, units]);
  // Opções: as unidades achadas e, no fim, "buscar pessoas"
  const options = [...matches.map((u) => ({ kind: "unit" as const, id: u.id, label: u.label })), ...(text.trim().length >= 2 ? [{ kind: "people" as const, id: "", label: `Buscar pessoas: “${text.trim()}”` }] : [])];

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
      if (e.key === "/" && !typing) {
        e.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function go(o: (typeof options)[number]) {
    setOpen(false);
    if (o.kind === "unit") {
      setText("");
      router.push(`/portaria?u=${o.id}`);
    } else router.push(`/portaria?q=${encodeURIComponent(text.trim())}`);
  }

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" />
      <input
        ref={input}
        value={text}
        autoFocus
        autoComplete="off"
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setHi(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHi((h) => Math.min(h + 1, options.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHi((h) => Math.max(0, h - 1));
          } else if (e.key === "Enter" && options[hi]) {
            e.preventDefault();
            go(options[hi]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder="Unidade (502, A502, aurora 502) ou nome"
        aria-label="Buscar unidade ou pessoa"
        className="h-14 w-full rounded-2xl border border-line bg-surface pl-12 pr-12 text-lg text-fg shadow-card outline-none transition placeholder:text-muted focus:border-brand focus:ring-4 focus:ring-brand/15"
      />
      <kbd className="pointer-events-none absolute right-4 top-1/2 hidden -translate-y-1/2 rounded-md border border-line px-1.5 font-mono text-xs text-muted sm:block">/</kbd>
      {open && options.length > 0 && (
        <ul className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-line bg-surface py-1 shadow-pop">
          {options.map((o, i) => (
            <li key={o.kind + o.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => go(o)}
                onMouseEnter={() => setHi(i)}
                className={cx("flex w-full items-center gap-3 px-4 py-3 text-left text-base", i === hi ? "bg-brand/10 font-semibold text-brand" : "text-fg-2")}
              >
                {o.kind === "unit" ? <Building2 className="size-5 shrink-0" /> : <Users className="size-5 shrink-0" />}
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Recebimento em lote: transportadora e local fixos, o porteiro digita a unidade e aperta Enter.
 * Cada Enter registra uma encomenda e avisa a unidade; o campo limpa para a próxima.
 */
export function BatchReceive({ units, locations }: { units: UnitOption[]; locations: string[] }) {
  const [carrier, setCarrier] = useState("");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ key: number; unit: string; ok: boolean; msg: string }[]>([]);
  const [pickerKey, setPickerKey] = useState(0);
  const unitInput = useRef<HTMLInputElement>(null);

  async function register(unitId: string) {
    if (!unitId || busy) return;
    setBusy(true);
    const f = new FormData();
    f.set("unitId", unitId);
    f.set("carrier", carrier);
    f.set("location", location);
    f.set("volumes", "1");
    const r = await receiveParcel(undefined, f).catch(() => ({ error: "Falhou. Tente de novo." }) as ParcelState);
    const unit = units.find((u) => u.id === unitId)?.label ?? "";
    setDone((d) => [{ key: Date.now(), unit, ok: !!r?.ok, msg: r?.ok ? (r.message?.includes("avisada") ? "avisada" : "sem morador com conta") : r?.error ?? "erro" }, ...d].slice(0, 30));
    setBusy(false);
    setPickerKey((k) => k + 1);
    setTimeout(() => unitInput.current?.focus(), 0);
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Transportadora (fixa)">
          <Input value={carrier} onChange={(e) => setCarrier(e.target.value)} list="batch-carriers" placeholder="Correios, Mercado Livre…" />
          <datalist id="batch-carriers">{CARRIERS.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        <Field label="Onde vão ficar (fixo)">
          <Input value={location} onChange={(e) => setLocation(e.target.value)} list="batch-locations" placeholder="Armário 3, Prateleira B" />
          <datalist id="batch-locations">{locations.map((l) => <option key={l} value={l} />)}</datalist>
        </Field>
      </div>
      {locations.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {locations.slice(0, 8).map((l) => (
            <button key={l} type="button" onClick={() => setLocation(l)} className={cx("rounded-full px-2.5 py-0.5 text-xs font-medium", location === l ? "bg-brand text-brand-ink" : "bg-bg-2 text-fg-2 hover:bg-line")}>{l}</button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <UnitPicker key={pickerKey} units={units} big inputRef={unitInput} onEnter={register} placeholder="Digite a unidade e Enter" className="flex-1" autoFocus={pickerKey > 0} />
        {busy && <Loader2 className="size-5 animate-spin text-muted" />}
      </div>
      <p className="text-xs text-muted">Cada Enter registra uma encomenda e avisa a unidade. Para foto, destinatário ou mais volumes, use “Receber encomenda” no cartão da unidade.</p>
      {done.length > 0 && (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {done.map((d) => (
            <li key={d.key} className="flex items-center gap-2 px-3 py-2 text-sm">
              {d.ok ? <PackageCheck className="size-4 text-ok" /> : <X className="size-4 text-bad" />}
              <span className="flex-1 font-medium">{d.unit}</span>
              <span className="text-xs text-muted">{[carrier, location].filter(Boolean).join(" · ")}</span>
              <span className={cx("text-xs", d.ok ? "text-muted" : "text-bad")}>{d.msg}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Cartão da unidade: os três botões grandes e o formulário que cada um abre, já com a unidade. */
export function UnitActions({ unitId, units, locations, labelUnits, residents, kinds }: {
  unitId: string; units: UnitOption[]; locations: string[]; labelUnits: LabelUnit[]; residents: LabelResident[]; kinds: PersonKind[];
}) {
  const [open, setOpen] = useState<"parcel" | "entry" | "grant" | null>(null);
  const big = "h-12 px-4 text-[15px]";
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <Button className={big} variant={open === "parcel" ? "brand" : "outline"} onClick={() => setOpen(open === "parcel" ? null : "parcel")}><PackagePlus className="size-5" />Receber encomenda</Button>
        <Button className={big} variant={open === "entry" ? "brand" : "outline"} onClick={() => setOpen(open === "entry" ? null : "entry")}><DoorOpen className="size-5" />Registrar entrada</Button>
        <Button className={big} variant={open === "grant" ? "brand" : "outline"} onClick={() => setOpen(open === "grant" ? null : "grant")}><UserPlus className="size-5" />Autorizar pessoa</Button>
      </div>
      {open && (
        <div className="rounded-2xl border border-line bg-bg-2/40 p-4">
          {open === "parcel" && <ReceiveParcelForm units={units} locations={locations} labelUnits={labelUnits} residents={residents} fixedUnit={unitId} onDone={() => setOpen(null)} />}
          {open === "entry" && <EntryForm units={units} defaultUnitIds={[unitId]} onDone={() => setOpen(null)} />}
          {open === "grant" && <GrantForm units={units} kinds={kinds} fixedUnit={unitId} onDone={() => setOpen(null)} />}
        </div>
      )}
    </div>
  );
}

/** Entregar todas as encomendas da unidade de uma vez. */
export function DeliverAll({ unitId, count, suggestion }: { unitId: string; count: number; suggestion?: string }) {
  const [openForm, setOpenForm] = useState(false);
  const [state, form, pending] = useFormSubmit((p: ParcelState, f: FormData) => deliverUnitParcels(unitId, p, f));
  if (state?.ok) return <Alert tone="ok">{state.message}</Alert>;
  if (!openForm) return <Button variant="outline" className="h-11 w-full" onClick={() => setOpenForm(true)}><CheckCheck className="size-5" />Entregar todas ({count})</Button>;
  return (
    <form {...form} className="flex flex-wrap items-end gap-2 rounded-xl bg-bg-2 p-3">
      <Field label="Retiradas por" className="min-w-52 flex-1"><Input name="deliveredTo" required minLength={2} maxLength={120} defaultValue={suggestion ?? ""} autoFocus /></Field>
      <SubmitButton pending={pending} pendingText="Salvando…">Confirmar ({count})</SubmitButton>
      <Button type="button" variant="ghost" onClick={() => setOpenForm(false)}>Cancelar</Button>
      {state?.error && <p className="basis-full text-xs text-bad">{state.error}</p>}
    </form>
  );
}

/** Filtro por unidade digitando: escolheu, a página recarrega com o filtro (sem botão). */
export function UnitFilter({ units, value, param = "unidade", base, extra, condoOption }: {
  units: UnitOption[]; value: string; param?: string; base: string; extra?: Record<string, string>;
  /** Mostra também "Condomínio" (sem unidade) como opção. */
  condoOption?: boolean;
}) {
  const router = useRouter();
  const go = (id: string) => {
    const qs = new URLSearchParams({ ...(extra ?? {}), ...(id ? { [param]: id } : {}) });
    router.push(`${base}?${qs.toString()}`);
  };
  return (
    <div className="flex min-w-60 flex-1 items-center gap-2">
      <UnitPicker units={units} value={value === "condominio" ? "" : value} onChange={go} placeholder="Filtrar por unidade (502, aurora 502)" allowEmptyLabel="Todas as unidades" className="flex-1" />
      {condoOption && (
        <Button type="button" size="sm" variant={value === "condominio" ? "brand" : "outline"} onClick={() => go(value === "condominio" ? "" : "condominio")}>Condomínio</Button>
      )}
    </div>
  );
}
