"use client";

import { useTransition } from "react";
import { Loader2, UserMinus } from "lucide-react";
import { assignSyndic, removeSyndic, type AdminState } from "@/app/actions/admin";
import { useFormSubmit } from "@/components/use-form-submit";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Avatar, Input } from "@/components/ui";

/** Síndicos do condomínio: atribuir pelo e-mail e remover o vínculo. */
export function SyndicsCard({ condoId, syndics }: { condoId: string; syndics: { id: string; name: string; email: string; avatarUrl: string | null }[] }) {
  const [state, form, pending] = useFormSubmit((p: AdminState, f: FormData) => assignSyndic(condoId, p, f));
  const [removing, start] = useTransition();
  return (
    <div className="space-y-4 p-5">
      {syndics.length ? (
        <ul className="space-y-2">
          {syndics.map((s) => (
            <li key={s.id} className="flex items-center gap-3">
              <Avatar name={s.name} src={s.avatarUrl} size={32} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{s.name}</p>
                <p className="truncate text-xs text-muted">{s.email}</p>
              </div>
              <button
                type="button"
                disabled={removing}
                onClick={() => confirm(`Tirar ${s.name} da função de síndico deste condomínio? A conta continua existindo.`) && start(() => removeSyndic(condoId, s.id))}
                aria-label={`Remover ${s.name} como síndico`}
                className="inline-flex size-8 items-center justify-center rounded-lg text-muted hover:bg-bad/10 hover:text-bad"
              >
                {removing ? <Loader2 className="size-4 animate-spin" /> : <UserMinus className="size-4" />}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">Nenhum síndico vinculado.</p>
      )}
      <form {...form} className="flex gap-2">
        <Input name="email" type="email" required placeholder="E-mail do novo síndico" className="flex-1" />
        <SubmitButton pending={pending} size="md" pendingText="…">Atribuir</SubmitButton>
      </form>
      <p className="text-xs text-muted">A pessoa precisa já ter cadastro. Quem já é do condomínio com outro perfil passa a ser síndico.</p>
      {state?.error && <Alert>{state.error}</Alert>}
      {state?.message && <Alert tone="ok">{state.message}</Alert>}
    </div>
  );
}
