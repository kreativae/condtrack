"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Download, Loader2, UserX } from "lucide-react";
import { cancelAccountDeletion, requestAccountDeletion } from "@/app/actions/privacy";
import { useFormSubmit } from "@/components/use-form-submit";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Button, Field, Textarea, buttonClass } from "@/components/ui";

/** LGPD em Meu perfil: documentos, aceite, cópia dos dados e pedido de exclusão. */
export function PrivacyCard({ acceptedAt, version, deletionRequestedAt, superadmin, disabledReason, texts }: {
  acceptedAt: string | null; version: string | null; deletionRequestedAt: string | null; superadmin: boolean; disabledReason?: string;
  /** Textos editáveis em Configurações → Dados legais, já com as variáveis preenchidas. */
  texts: { intro: string; warning: string; pending: string };
}) {
  const [asking, setAsking] = useState(false);
  const [state, form, pending] = useFormSubmit(requestAccountDeletion);
  const [cancelling, start] = useTransition();
  const day = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");

  return (
    <div className="space-y-4 text-sm">
      {texts.intro && <p className="whitespace-pre-line text-fg-2">{texts.intro}</p>}
      <p className="text-fg-2">
        Leia os <Link href="/termos" target="_blank" className="font-medium text-brand hover:underline">Termos de Uso</Link> e a{" "}
        <Link href="/privacidade" target="_blank" className="font-medium text-brand hover:underline">Política de Privacidade</Link>.
        {acceptedAt && <span className="text-muted"> Aceitos em {day(acceptedAt)}{version && ` (versão de ${version.split("-").reverse().join("/")})`}.</span>}
      </p>
      {disabledReason ? (
        <p className="text-muted">{disabledReason}</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <a href="/api/meus-dados" className={buttonClass("outline")}><Download className="size-4" />Baixar meus dados</a>
            {!superadmin && !deletionRequestedAt && !asking && (
              <Button variant="danger" onClick={() => setAsking(true)}><UserX className="size-4" />Pedir exclusão da conta</Button>
            )}
          </div>
          {deletionRequestedAt && (
            <div className="space-y-2 rounded-xl bg-warn/10 p-4 ring-1 ring-inset ring-warn/20">
              <p className="whitespace-pre-line text-fg-2">{texts.pending}</p>
              <Button variant="ghost" size="sm" disabled={cancelling} onClick={() => start(() => cancelAccountDeletion())}>
                {cancelling && <Loader2 className="size-4 animate-spin" />}Desistir do pedido
              </Button>
            </div>
          )}
          {asking && !deletionRequestedAt && (
            <form {...form} className="space-y-3">
              <p className="whitespace-pre-line text-fg-2">{texts.warning}</p>
              <Field label="Motivo (opcional)"><Textarea name="reason" rows={2} maxLength={500} /></Field>
              <div className="flex gap-2">
                <SubmitButton pending={pending} pendingText="Enviando…" variant="danger">Confirmar pedido</SubmitButton>
                <Button type="button" variant="ghost" onClick={() => setAsking(false)}>Cancelar</Button>
              </div>
            </form>
          )}
          {state?.error && <Alert>{state.error}</Alert>}
          {state?.message && <Alert tone="ok">{state.message}</Alert>}
        </>
      )}
    </div>
  );
}
