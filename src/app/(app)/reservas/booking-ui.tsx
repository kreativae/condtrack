"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, Loader2, UserCheck } from "lucide-react";
import { cancelBooking, createBooking, decideBooking, saveGuests, toggleGuestArrival } from "@/app/actions/bookings";
import { useFormSubmit } from "@/components/use-form-submit";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Button, Field, Input, Select, Textarea, cx } from "@/components/ui";
import { bookingRange, fmtPeriod, overlaps, parseGuests } from "@/lib/booking";

type Area = { id: string; name: string; capacity: number | null; openTime: string | null; closeTime: string | null; bookingRules: string; requiresApproval: boolean; description: string | null };
type Busy = { areaId: string; startAt: string; endAt: string; status: string };

/** Nova reserva: área, unidade, dia, horário, observações e lista de convidados. */
export function BookingForm({ areas, units, busy, today, gate }: { areas: Area[]; units: { id: string; label: string }[]; busy: Busy[]; today: string; gate: boolean }) {
  const [state, form, pending] = useFormSubmit(createBooking);
  const [areaId, setAreaId] = useState(areas[0]?.id ?? "");
  const [day, setDay] = useState(today);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [guests, setGuests] = useState("");
  const area = areas.find((a) => a.id === areaId);
  const count = useMemo(() => parseGuests(guests).length, [guests]);

  // Horários já ocupados nesta área no dia escolhido (e o conflito com o horário digitado)
  const dayStart = new Date(`${day}T00:00:00-03:00`);
  const dayEnd = new Date(dayStart.getTime() + 86400_000);
  const taken = busy.filter((b) => b.areaId === areaId && new Date(b.startAt) < dayEnd && new Date(b.endAt) > dayStart);
  const range = day && start && end ? bookingRange(day, start, end) : null;
  const clash = range ? taken.find((b) => overlaps(range, { startAt: new Date(b.startAt), endAt: new Date(b.endAt) })) : undefined;

  if (!areas.length) return <p className="text-sm text-muted">Nenhuma área está aberta para reservas. O síndico libera em Estrutura → Áreas comuns.</p>;
  return (
    <form {...form} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Área">
          <Select name="areaId" value={areaId} onChange={(e) => setAreaId(e.target.value)} required>
            {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </Field>
        <Field label="Unidade">
          <Select name="unitId" defaultValue={units.length === 1 ? units[0].id : ""} required={!gate}>
            {(units.length !== 1 || gate) && <option value="">{gate ? "Sem unidade (uso do condomínio)" : "Selecione…"}</option>}
            {units.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
          </Select>
        </Field>
      </div>

      {area && (
        <div className="space-y-1 rounded-xl bg-bg-2 p-4 text-sm text-fg-2">
          <p>
            {area.openTime && area.closeTime ? <>Funciona das <b className="text-fg">{area.openTime}</b> às <b className="text-fg">{area.closeTime}</b></> : "Sem horário fixo"}
            {area.capacity ? <> · até <b className="text-fg">{area.capacity}</b> convidados</> : null}
            {" · "}{area.requiresApproval && !gate ? "precisa de aprovação" : "confirmada na hora"}
          </p>
          {area.description && <p className="text-muted">{area.description}</p>}
          {area.bookingRules && <p className="whitespace-pre-line"><b className="text-fg">Regras:</b> {area.bookingRules}</p>}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Dia"><Input type="date" name="day" min={today} value={day} onChange={(e) => setDay(e.target.value)} required /></Field>
        <Field label="Início"><Input type="time" name="start" value={start} onChange={(e) => setStart(e.target.value)} required /></Field>
        <Field label="Fim" hint="Antes do início = termina no dia seguinte."><Input type="time" name="end" value={end} onChange={(e) => setEnd(e.target.value)} required /></Field>
      </div>
      {taken.length > 0 && (
        <div className="text-sm">
          <p className="font-medium text-fg-2">Já reservado neste dia:</p>
          <ul className="mt-1 space-y-0.5 text-muted">{taken.map((b, i) => <li key={i}>• {fmtPeriod(b.startAt, b.endAt)}{b.status === "pending" ? " (aguardando aprovação)" : ""}</li>)}</ul>
        </div>
      )}
      {clash && <Alert tone="warn">Esse horário bate com outra reserva ({fmtPeriod(clash.startAt, clash.endAt)}).</Alert>}

      <Field label={`Convidados (${count}${area?.capacity ? ` de ${area.capacity}` : ""})`} hint="Um por linha. Documento opcional depois de ponto e vírgula (ex.: Ana Souza; 123.456.789-00). Dá para editar depois.">
        <Textarea name="guests" rows={6} value={guests} onChange={(e) => setGuests(e.target.value)} placeholder={"Ana Souza; 123.456.789-00\nBruno Lima"} />
      </Field>
      <Field label="Observações (opcional)"><Textarea name="notes" rows={2} maxLength={1000} placeholder="Ex.: aniversário infantil, vou usar a churrasqueira." /></Field>

      {state?.error && <Alert>{state.error}</Alert>}
      <SubmitButton pending={pending} pendingText="Reservando…" disabled={!!clash || (!!area?.capacity && count > area.capacity)}>
        {area?.requiresApproval && !gate ? "Pedir reserva" : "Reservar"}
      </SubmitButton>
    </form>
  );
}

/** Lista de convidados editável (quem reservou e a portaria). */
export function GuestsEditor({ id, initial, capacity }: { id: string; initial: string; capacity: number | null }) {
  const [state, form, pending] = useFormSubmit((p: Awaited<ReturnType<typeof saveGuests>>, f: FormData) => saveGuests(id, p, f));
  const [text, setText] = useState(initial);
  const count = parseGuests(text).length;
  return (
    <form {...form} className="space-y-3">
      <Field label={`Lista de convidados (${count}${capacity ? ` de ${capacity}` : ""})`} hint="Um por linha; documento opcional depois de ponto e vírgula. Quem já chegou continua na lista.">
        <Textarea name="guests" rows={8} value={text} onChange={(e) => setText(e.target.value)} />
      </Field>
      {state?.error && <Alert>{state.error}</Alert>}
      {state?.message && <Alert tone="ok">{state.message}</Alert>}
      <SubmitButton pending={pending} pendingText="Salvando…" size="sm">Salvar lista</SubmitButton>
    </form>
  );
}

/** Aprovar ou recusar (com motivo). */
export function DecisionForm({ id }: { id: string }) {
  const [mode, setMode] = useState<"approved" | "rejected" | null>(null);
  // A decisão vem do botão clicado (submitter), não do estado: o envio acontece antes do novo render
  const [state, form, pending] = useFormSubmit((p: Awaited<ReturnType<typeof decideBooking>>, f: FormData) => decideBooking(id, f.get("decision") === "rejected" ? "rejected" : "approved", p, f));
  return (
    <form {...form} className="space-y-3">
      <Field label={mode === "rejected" ? "Motivo da recusa" : "Comentário (opcional)"}>
        <Textarea name="note" rows={2} maxLength={500} placeholder={mode === "rejected" ? "Ex.: área em manutenção nesse dia." : "Ex.: retirar a chave na portaria."} />
      </Field>
      {state?.error && <Alert>{state.error}</Alert>}
      {state?.message && <Alert tone="ok">{state.message}</Alert>}
      <div className="flex flex-wrap gap-2">
        <SubmitButton name="decision" value="approved" pending={pending && mode === "approved"} pendingText="Aprovando…" onClick={() => setMode("approved")}><Check className="size-4" />Aprovar</SubmitButton>
        <SubmitButton name="decision" value="rejected" pending={pending && mode === "rejected"} pendingText="Recusando…" variant="danger" onClick={() => setMode("rejected")}>Recusar</SubmitButton>
      </div>
    </form>
  );
}

export function CancelForm({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [state, form, pending] = useFormSubmit((p: Awaited<ReturnType<typeof cancelBooking>>, f: FormData) => cancelBooking(id, p, f));
  if (!open) return <Button variant="ghost" size="sm" onClick={() => setOpen(true)} className="text-bad">Cancelar reserva</Button>;
  return (
    <form {...form} className="space-y-3">
      <Field label="Motivo (opcional)"><Input name="reason" maxLength={500} /></Field>
      {state?.error && <Alert>{state.error}</Alert>}
      <div className="flex gap-2">
        <SubmitButton pending={pending} pendingText="Cancelando…" variant="danger" size="sm">Confirmar cancelamento</SubmitButton>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>Voltar</Button>
      </div>
    </form>
  );
}

/** Portaria: marcar a chegada de um convidado. */
export function ArrivalButton({ guestId, arrived }: { guestId: string; arrived: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(() => toggleGuestArrival(guestId))}
      className={cx("inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition", arrived ? "bg-ok/10 text-ok hover:bg-ok/15" : "border border-line text-fg-2 hover:bg-bg-2")}
      title={arrived ? "Desfazer chegada" : "Marcar chegada"}
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <UserCheck className="size-3.5" />}
      {arrived ? "Chegou" : "Chegou?"}
    </button>
  );
}
