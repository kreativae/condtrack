"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, MapPin, PackageCheck, Pencil, Undo2, X } from "lucide-react";
import { deliverParcel, moveParcel, receiveParcel, returnParcel, type ParcelState } from "@/app/actions/parcels";
import { useFormSubmit } from "@/components/use-form-submit";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Badge, Button, Field, Input, Select, cx } from "@/components/ui";
import { CARRIERS } from "@/lib/parcels";

type Opt = { id: string; label: string };

/**
 * Receber encomenda. Transportadora e local continuam preenchidos depois de salvar,
 * para registrar várias seguidas (chegou o caminhão dos Correios com 10 pacotes).
 */
export function ReceiveParcelForm({ units, locations }: { units: Opt[]; locations: string[] }) {
  const [key, setKey] = useState(0);
  const [carrier, setCarrier] = useState("");
  const [location, setLocation] = useState("");
  const [state, form, pending] = useFormSubmit(async (p: ParcelState, f: FormData) => {
    const r = await receiveParcel(p, f);
    if (r?.ok) setKey((k) => k + 1);
    return r;
  });
  return (
    <form {...form} className="space-y-4">
      <div key={key} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Unidade">
          <Select name="unitId" required defaultValue="" autoFocus={key > 0}>
            <option value="" disabled>Selecione…</option>
            {units.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
          </Select>
        </Field>
        <Field label="Destinatário (opcional)"><Input name="recipient" maxLength={120} placeholder="Nome no pacote" /></Field>
        <Field label="Descrição ou rastreio (opcional)"><Input name="description" maxLength={200} placeholder="Caixa média, envelope, BR123456789" /></Field>
        <Field label="Volumes"><Input name="volumes" type="number" min={1} max={99} defaultValue={1} /></Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Transportadora">
          <Input name="carrier" maxLength={60} list="parcel-carriers" value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="Correios, Mercado Livre…" />
          <datalist id="parcel-carriers">{CARRIERS.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        <Field label="Onde ficou guardada" hint="Fica preenchido para a próxima.">
          <Input name="location" maxLength={60} list="parcel-locations" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Armário 3, Prateleira B, Geladeira" />
          <datalist id="parcel-locations">{locations.map((l) => <option key={l} value={l} />)}</datalist>
        </Field>
      </div>
      {locations.length > 0 && (
        <div className="-mt-2 flex flex-wrap gap-1">
          {locations.slice(0, 8).map((l) => (
            <button key={l} type="button" onClick={() => setLocation(l)} className={cx("rounded-full px-2.5 py-0.5 text-xs font-medium transition", location === l ? "bg-brand text-brand-ink" : "bg-bg-2 text-fg-2 hover:bg-line")}>{l}</button>
          ))}
        </div>
      )}
      {state?.error && <Alert>{state.error}</Alert>}
      {state?.message && <Alert tone="ok">{state.message}</Alert>}
      <SubmitButton pending={pending} pendingText="Registrando…" size="sm"><PackageCheck className="size-4" />Registrar e avisar a unidade</SubmitButton>
    </form>
  );
}

export type ParcelRowData = {
  id: string; unit: string; recipient: string | null; what: string; volumes: number; location: string | null;
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
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{p.unit}{p.recipient && <span className="font-normal text-fg-2"> · {p.recipient}</span>}</p>
          <p className="text-xs text-muted">{p.what}{p.volumes > 1 && ` · ${p.volumes} volumes`} · recebida {p.receivedAt} por {p.receivedBy}</p>
        </div>
        <button type="button" onClick={() => setMode(mode === "move" ? null : "move")} title="Trocar o local" className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-2.5 py-1 text-xs font-semibold text-brand hover:bg-brand/15">
          <MapPin className="size-3" />{p.location ?? "Sem local"}
        </button>
        <Badge tone={p.overdue ? "bad" : "muted"}>{p.wait}</Badge>
        <Button size="sm" variant={mode === "deliver" ? "brand" : "outline"} onClick={() => setMode(mode === "deliver" ? null : "deliver")}><Check className="size-3.5" />Entregar</Button>
        <button type="button" onClick={() => setMode(mode === "return" ? null : "return")} title="Devolver ou cancelar" className="rounded-lg p-1.5 text-muted hover:bg-bg-2 hover:text-fg"><Undo2 className="size-4" /></button>
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
