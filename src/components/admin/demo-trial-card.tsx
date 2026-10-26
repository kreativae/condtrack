"use client";

import { useActionState } from "react";
import { CalendarClock, Mail, MessageCircle, Phone, Send } from "lucide-react";
import { Alert, Badge, Card, CardHeader, Field, Input, buttonClass, cx } from "@/components/ui";
import { updateDemoTrial, type TrialState } from "@/app/actions/demo";
import { DEMO_TRIAL_DEFAULT_DAYS, DEMO_TRIAL_MAX_DAYS, trialStatus, whatsappNumber } from "@/lib/demo-trial";

type Props = {
  id: string;
  expiresAt: string | null;
  /** Agora, vindo do servidor (a página é renderizada lá; evita diferença na hidratação). */
  nowMs: number;
  contact: { name: string | null; email: string | null; phone: string | null };
  /** Último envio do e-mail com as contas (ISO), se houve. */
  inviteSentAt: string | null;
  /** Só a demonstração externa tem a série de contas de teste para enviar. */
  canInvite: boolean;
};

/** Prazo da demonstração (quando as contas de teste param de entrar) e contato de quem está testando. */
export function DemoTrialCard({ id, expiresAt, nowMs, contact, inviteSentAt, canInvite }: Props) {
  const [state, action, pending] = useActionState<TrialState, FormData>(updateDemoTrial.bind(null, id), null);
  const end = expiresAt ? new Date(expiresAt) : null;
  const status = trialStatus(end, nowMs);
  const when = end ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(end) : null;
  const wa = whatsappNumber(contact.phone);

  return (
    <Card>
      <CardHeader
        title="Prazo do teste"
        subtitle="Depois do prazo, as contas desta demonstração não entram mais e os superadmins recebem um aviso."
        action={status.kind === "expired" ? <Badge tone="bad" dot>Encerrado</Badge> : status.kind === "active" ? <Badge tone={status.daysLeft <= 2 ? "warn" : "ok"} dot>{status.daysLeft === 1 ? "1 dia" : `${status.daysLeft} dias`}</Badge> : <Badge tone="muted">Sem prazo</Badge>}
      />
      <form action={action} className="space-y-4 p-5">
        <p className="flex items-center gap-2 text-sm text-fg-2">
          <CalendarClock className="size-4 shrink-0 text-brand" />
          {status.kind === "none" ? "Sem prazo: as contas entram até a demonstração ser excluída." : status.kind === "expired" ? `Terminou em ${when}.` : `Termina em ${when}.`}
        </p>

        {(contact.name || contact.email || contact.phone) && (
          <div className="rounded-xl bg-bg-2 px-4 py-3 text-sm">
            <p className="font-semibold">{contact.name ?? "Quem está testando"}</p>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1.5">
              {contact.email && <a href={`mailto:${contact.email}`} className="inline-flex items-center gap-1.5 text-brand hover:underline"><Mail className="size-3.5" />{contact.email}</a>}
              {contact.phone && <a href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1.5 text-brand hover:underline"><Phone className="size-3.5" />{contact.phone}</a>}
              {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-ok hover:underline"><MessageCircle className="size-3.5" />WhatsApp</a>}
            </div>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nome de quem testa"><Input name="contactName" defaultValue={contact.name ?? ""} placeholder="Nome e empresa" autoComplete="off" /></Field>
          <Field label="Telefone"><Input name="contactPhone" type="tel" inputMode="tel" defaultValue={contact.phone ?? ""} placeholder="(11) 98888-7777" autoComplete="off" /></Field>
          <div className="sm:col-span-2"><Field label="E-mail"><Input name="contactEmail" type="email" defaultValue={contact.email ?? ""} placeholder="pessoa@empresa.com" autoComplete="off" /></Field></div>
        </div>

        <div className="flex flex-wrap items-end gap-2 border-t border-line pt-4">
          <Field label={status.kind === "none" ? "Dar prazo de" : "Prorrogar por"}>
            <Input name="days" type="number" min={1} max={DEMO_TRIAL_MAX_DAYS} inputMode="numeric" defaultValue={DEMO_TRIAL_DEFAULT_DAYS} className="w-24" aria-describedby="dias-ajuda" />
          </Field>
          <span id="dias-ajuda" className="pb-2.5 text-sm text-muted">dias</span>
          <button name="intent" value="extend" disabled={pending} className={cx(buttonClass("brand"), "ml-auto")}>{status.kind === "none" ? "Definir prazo" : "Prorrogar"}</button>
          <button name="intent" value="save" disabled={pending} className={buttonClass("outline")}>Salvar contato</button>
          {status.kind === "active" && <button name="intent" value="end" disabled={pending} className={buttonClass("danger")}>Encerrar agora</button>}
        </div>
        {canInvite && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line px-4 py-3">
            <Send className="size-4 shrink-0 text-brand" />
            <p className="min-w-0 flex-1 text-sm">
              <span className="font-medium">Acesso por e-mail</span>
              <span className="block text-xs text-muted">{inviteSentAt ? `Enviado em ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(inviteSentAt))}.` : "Ainda não enviado."} Contas de cada perfil, senha e prazo, para o e-mail acima.</span>
            </p>
            <button name="intent" value="invite" disabled={pending} className={buttonClass("outline", "sm")}>{inviteSentAt ? "Reenviar" : "Enviar"}</button>
          </div>
        )}
        {status.kind !== "none" && <p className="text-xs text-muted">Prorrogar soma os dias ao fim atual (ou a partir de agora, se já terminou) e libera as contas de novo.</p>}
        {state?.error && <Alert>{state.error}</Alert>}
        {state?.message && <Alert tone="ok">{state.message}</Alert>}
      </form>
    </Card>
  );
}
