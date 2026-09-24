"use client";

import { useActionState, useState } from "react";
import { Eye, KeyRound, Power, Trash2 } from "lucide-react";
import { deleteUser, resetPassword, toggleUserStatus } from "@/app/actions/admin";
import { impersonate } from "@/app/actions/auth";
import { SecretBox } from "./secret-box";

export function UserRowActions({ id, name, active, canImpersonate }: { id: string; name: string; active: boolean; canImpersonate?: boolean }) {
  const [state, reset, pending] = useActionState(resetPassword.bind(null, id), undefined);
  const [removal, remove, removing] = useActionState(deleteUser.bind(null, id), undefined);
  const [asking, setAsking] = useState(false);
  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-1">
        {canImpersonate && active && (
          <form action={impersonate.bind(null, id)}>
            <button title="Visualizar como" className="rounded-lg p-2 text-muted hover:bg-brand/10 hover:text-brand"><Eye className="size-4" /></button>
          </form>
        )}
        <form action={reset}>
          <button title="Redefinir senha" disabled={pending} className="rounded-lg p-2 text-muted hover:bg-fg/5 hover:text-fg"><KeyRound className="size-4" /></button>
        </form>
        <form action={toggleUserStatus.bind(null, id)}>
          <button title={active ? "Desativar acesso" : "Reativar acesso"} className={active ? "rounded-lg p-2 text-muted hover:bg-bad/10 hover:text-bad" : "rounded-lg p-2 text-ok hover:bg-ok/10"}>
            <Power className="size-4" />
          </button>
        </form>
        {/* Exclusão só para quem já está inativo */}
        {!active && (
          <button type="button" title="Excluir usuário" disabled={removing} onClick={() => setAsking(true)} className="rounded-lg p-2 text-muted hover:bg-bad/10 hover:text-bad">
            <Trash2 className="size-4" />
          </button>
        )}
      </div>
      {asking && (
        <form
          action={() => {
            setAsking(false);
            remove();
          }}
          className="flex max-w-72 flex-wrap items-center justify-end gap-2 rounded-xl bg-bad/10 px-3 py-2"
        >
          <span className="text-xs font-medium text-bad">Excluir {name}? Não pode ser desfeito.</span>
          <button type="submit" className="rounded-lg bg-bad px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90">Excluir</button>
          <button type="button" onClick={() => setAsking(false)} className="rounded-lg px-2 py-1 text-xs font-medium text-fg-2 hover:bg-bg-2">Cancelar</button>
        </form>
      )}
      {removal?.error && <p className="max-w-72 text-right text-xs text-bad">{removal.error}</p>}
      {state?.secret && <div className="w-56"><SecretBox secret={state.secret} />{state.message && <p className="mt-1 text-right text-[11px] text-muted">{state.message}</p>}</div>}
      {state?.error && <p className="text-xs text-bad">{state.error}</p>}
    </div>
  );
}
