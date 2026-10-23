"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { ArchiveRestore, CheckCircle2, Download, Loader2, ShieldAlert, Trash2, X } from "lucide-react";
import { archiveCondominium, forceDeleteCondominium, purgeCondominium, restoreCondominium, type AdminState } from "@/app/actions/admin";
import { useFormSubmit } from "@/components/use-form-submit";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Button, Field, Input, Textarea, buttonClass } from "@/components/ui";

/** "Excluir" condomínio real = arquivar, com confirmação pelo nome. */
export function ArchiveCondoButton({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [state, form, pending] = useFormSubmit((p: AdminState, f: FormData) => archiveCondominium(id, p, f));
  const ok = typed.trim().toLowerCase() === name.trim().toLowerCase();
  const close = () => !pending && setOpen(false);
  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}><Trash2 className="size-4" />Excluir condomínio</Button>
      {/* Portal no <body>: a animação de entrada da página prende elementos "fixed" dentro dela */}
      {open && createPortal(
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Excluir condomínio">
          <div className="absolute inset-0 bg-black/40" onClick={close} />
          <form {...form} className="relative w-full max-w-md overflow-hidden rounded-t-3xl bg-surface shadow-pop animate-in sm:rounded-3xl">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <p className="font-display text-lg font-semibold">Excluir condomínio</p>
              <button type="button" onClick={close} aria-label="Fechar" className="inline-flex size-9 items-center justify-center rounded-xl text-fg-2 hover:bg-bg-2"><X className="size-5" /></button>
            </div>
            <div className="space-y-4 px-5 py-5 text-sm text-fg-2">
              <p><b className="text-fg">{name}</b> sai de toda a plataforma: menus, listas, relatórios e avisos automáticos.</p>
              <ul className="list-disc space-y-1 pl-5">
                <li>Os dados (ordens de serviço, fotos, financeiro, assembleias, histórico) <b className="text-fg">ficam guardados</b> e voltam se você restaurar.</li>
                <li>Quem também participa de outro condomínio passa para ele. Quem só tinha este fica com o acesso desativado até a restauração.</li>
                <li>A assinatura precisa estar cancelada.</li>
              </ul>
              <Field label="Motivo (opcional)"><Textarea name="reason" rows={2} maxLength={500} /></Field>
              <Field label={`Para confirmar, digite: ${name}`}>
                <Input name="confirm" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
              </Field>
              {state?.error && <Alert>{state.error}</Alert>}
            </div>
            <div className="flex justify-end gap-2 border-t border-line px-5 py-4">
              <button type="button" onClick={close} disabled={pending} className={buttonClass("ghost")}>Cancelar</button>
              <SubmitButton pending={pending} pendingText="Excluindo…" variant="danger" disabled={!ok}>Excluir condomínio</SubmitButton>
            </div>
          </form>
        </div>,
        document.body,
      )}
    </>
  );
}

export function RestoreCondoButton({ id, size }: { id: string; size?: "sm" | "md" }) {
  const [pending, start] = useTransition();
  return (
    <Button variant="outline" size={size} disabled={pending} onClick={() => start(() => restoreCondominium(id))}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : <ArchiveRestore className="size-4" />}Restaurar
    </Button>
  );
}

/** Forçar exclusão: apaga de vez na hora, sem arquivar, sem exigir assinatura cancelada nem backup (o backup fica opcional). */
export function ForceDeleteCondoButton({ id, name, subscriptionActive }: { id: string; name: string; subscriptionActive: boolean }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [sure, setSure] = useState(false);
  const [state, form, pending] = useFormSubmit((p: AdminState, f: FormData) => forceDeleteCondominium(id, p, f));
  const ok = sure && typed.trim().toLowerCase() === name.trim().toLowerCase();
  const close = () => !pending && setOpen(false);
  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}><ShieldAlert className="size-4" />Forçar exclusão</Button>
      {open && createPortal(
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Forçar exclusão">
          <div className="absolute inset-0 bg-black/40" onClick={close} />
          <form {...form} className="relative flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-surface shadow-pop animate-in sm:rounded-3xl">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <p className="font-display text-lg font-semibold">Forçar exclusão</p>
              <button type="button" onClick={close} aria-label="Fechar" className="inline-flex size-9 items-center justify-center rounded-xl text-fg-2 hover:bg-bg-2"><X className="size-5" /></button>
            </div>
            <div className="space-y-4 overflow-y-auto px-5 py-5 text-sm text-fg-2">
              <p><b className="text-fg">{name}</b> será apagado agora, <b className="text-bad">sem arquivar antes e sem como restaurar</b>:</p>
              <ul className="list-disc space-y-1 pl-5">
                <li>Ordens de serviço, fotos, financeiro, assembleias, portaria, chamados e todo o histórico.</li>
                <li>Contas de quem só tinha este condomínio. Quem participa de outro passa para ele.</li>
                {subscriptionActive && <li><b className="text-fg">A assinatura ativa é cancelada no Stripe na hora</b>, sem esperar o fim do período.</li>}
                <li>Comissões de parceiro ligadas a este condomínio.</li>
              </ul>
              <div className="rounded-xl bg-bg-2 p-4">
                <p className="font-medium text-fg">Backup (opcional)</p>
                <p className="mt-1 text-xs text-muted">Arquivo .zip com os dados e os anexos do Financeiro, caso precise de algo depois.</p>
                <a href={`/api/admin/condominios/${id}/backup`} className={buttonClass("outline", "sm") + " mt-3"}><Download className="size-4" />Baixar backup</a>
              </div>
              <Field label="Motivo (opcional)"><Textarea name="reason" rows={2} maxLength={500} /></Field>
              <Field label={`Para confirmar, digite: ${name}`}>
                <Input name="confirm" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
              </Field>
              <label className="flex items-start gap-2 text-xs">
                <input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} className="mt-0.5 size-4 accent-[var(--bad)]" />
                <span>Entendo que a exclusão é definitiva e fica registrada na auditoria.</span>
              </label>
              {state?.error && <Alert>{state.error}</Alert>}
            </div>
            <div className="flex justify-end gap-2 border-t border-line px-5 py-4">
              <button type="button" onClick={close} disabled={pending} className={buttonClass("ghost")}>Cancelar</button>
              <SubmitButton pending={pending} pendingText="Excluindo…" variant="danger" disabled={!ok}>Excluir agora</SubmitButton>
            </div>
          </form>
        </div>,
        document.body,
      )}
    </>
  );
}

/** Exclusão definitiva de um condomínio arquivado: backup obrigatório antes, confirmação pelo nome. */
export function PurgeCondoButton({ id, name, size }: { id: string; name: string; size?: "sm" | "md" }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [saved, setSaved] = useState(false);
  const [state, form, pending] = useFormSubmit((p: AdminState, f: FormData) => purgeCondominium(id, p, f));
  const ok = saved && typed.trim().toLowerCase() === name.trim().toLowerCase();
  const close = () => !pending && setOpen(false);
  return (
    <>
      <Button variant="danger" size={size} onClick={() => setOpen(true)}><Trash2 className="size-4" />Excluir de vez</Button>
      {open && createPortal(
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Excluir definitivamente">
          <div className="absolute inset-0 bg-black/40" onClick={close} />
          <form {...form} className="relative w-full max-w-md overflow-hidden rounded-t-3xl bg-surface shadow-pop animate-in sm:rounded-3xl">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <p className="font-display text-lg font-semibold">Excluir definitivamente</p>
              <button type="button" onClick={close} aria-label="Fechar" className="inline-flex size-9 items-center justify-center rounded-xl text-fg-2 hover:bg-bg-2"><X className="size-5" /></button>
            </div>
            <div className="space-y-4 px-5 py-5 text-sm text-fg-2">
              <p><b className="text-fg">{name}</b> será apagado de vez, <b className="text-bad">sem como restaurar</b>:</p>
              <ul className="list-disc space-y-1 pl-5">
                <li>Ordens de serviço, fotos e vídeos, comunicados, assembleias, checklist e manutenção.</li>
                <li>Financeiro completo: lançamentos, notas fiscais, boletos, comprovantes e histórico.</li>
                <li>Contas de quem só tinha vínculo com este condomínio. Quem participa de outro continua normalmente.</li>
              </ul>
              <div className="rounded-xl bg-bg-2 p-4">
                <p className="font-medium text-fg">1. Baixe o backup</p>
                <p className="mt-1 text-xs text-muted">Arquivo .zip com todos os dados e os anexos do Financeiro (fotos e vídeos das OS não entram). Obrigatório, vale por 24 h.</p>
                <a href={`/api/admin/condominios/${id}/backup`} onClick={() => setSaved(true)} className={buttonClass("outline", "sm") + " mt-3"}>
                  {saved ? <CheckCircle2 className="size-4 text-ok" /> : <Download className="size-4" />}{saved ? "Backup baixado" : "Baixar backup"}
                </a>
              </div>
              <Field label={`2. Para confirmar, digite: ${name}`}>
                <Input name="confirm" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} disabled={!saved} />
              </Field>
              {state?.error && <Alert>{state.error}</Alert>}
            </div>
            <div className="flex justify-end gap-2 border-t border-line px-5 py-4">
              <button type="button" onClick={close} disabled={pending} className={buttonClass("ghost")}>Cancelar</button>
              <SubmitButton pending={pending} pendingText="Excluindo…" variant="danger" disabled={!ok}>Excluir de vez</SubmitButton>
            </div>
          </form>
        </div>,
        document.body,
      )}
    </>
  );
}
