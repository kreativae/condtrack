"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Loader2, Megaphone, Pencil, Square, Timer, Trash2 } from "lucide-react";
import { closeVoting, deleteAssembly, extendVoting, publishAssembly, type AssemblyState } from "@/app/actions/assembly";
import { useFormSubmit } from "@/components/use-form-submit";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Button, Input, buttonClass } from "@/components/ui";

/** Ações do síndico/superadmin conforme a situação da assembleia. */
export function ManageBar({ id, status, votingEndsAt }: { id: string; status: string; votingEndsAt: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<AssemblyState>(undefined);
  const [extending, setExtending] = useState(false);
  const [extState, extForm, extPending] = useFormSubmit(async (p: AssemblyState, f: FormData) => {
    const r = await extendVoting(id, p, f);
    if (r?.ok) setExtending(false);
    return r;
  });

  return (
    <div className="space-y-3 rounded-2xl bg-bg-2 p-4">
      <div className="flex flex-wrap gap-2">
        {status === "draft" && (
          <>
            <Button
              disabled={pending}
              onClick={() => {
                if (!confirm("Publicar a convocação? A pauta não poderá mais ser mudada, a votação abre e todo o condomínio é avisado.")) return;
                start(async () => setMsg(await publishAssembly(id)));
              }}
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Megaphone className="size-4" />}Publicar convocação
            </Button>
            <Link href={`/assembleias/${id}/editar`} className={buttonClass("outline")}><Pencil className="size-4" />Editar</Link>
            <Button variant="danger" disabled={pending} onClick={() => confirm("Excluir este rascunho?") && start(() => deleteAssembly(id))}><Trash2 className="size-4" />Excluir</Button>
          </>
        )}
        {status === "open" && (
          <>
            <Button variant="outline" onClick={() => setExtending((v) => !v)}><Timer className="size-4" />Prorrogar</Button>
            <Button
              variant="danger"
              disabled={pending}
              onClick={() => confirm("Encerrar a votação agora? Os votos ficam fechados e o resultado é divulgado.") && start(() => closeVoting(id))}
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Square className="size-4" />}Encerrar votação
            </Button>
          </>
        )}
        {status === "closed" && <p className="text-sm text-fg-2">Votação encerrada. Revise a ata abaixo e gere o PDF.</p>}
      </div>
      {extending && (
        <form {...extForm} className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-muted">Novo fim da votação<Input name="votingEndsAt" type="datetime-local" required defaultValue={votingEndsAt} className="mt-1" /></label>
          <SubmitButton pending={extPending} size="sm">Salvar</SubmitButton>
        </form>
      )}
      {(msg?.error || extState?.error) && <Alert>{msg?.error ?? extState?.error}</Alert>}
      {(msg?.message || extState?.message) && <Alert tone="ok">{msg?.message ?? extState?.message}</Alert>}
    </div>
  );
}
