"use client";

import { useActionState } from "react";
import { Eye, KeyRound, Power } from "lucide-react";
import { resetPassword, toggleUserStatus } from "@/app/actions/admin";
import { impersonate } from "@/app/actions/auth";
import { SecretBox } from "./secret-box";

export function UserRowActions({ id, active, canImpersonate }: { id: string; active: boolean; canImpersonate?: boolean }) {
  const [state, reset, pending] = useActionState(resetPassword.bind(null, id), undefined);
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
      </div>
      {state?.secret && <div className="w-56"><SecretBox secret={state.secret} />{state.message && <p className="mt-1 text-right text-[11px] text-muted">{state.message}</p>}</div>}
      {state?.error && <p className="text-xs text-bad">{state.error}</p>}
    </div>
  );
}
