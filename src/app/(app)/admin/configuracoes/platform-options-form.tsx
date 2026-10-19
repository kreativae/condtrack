"use client";

import { useState } from "react";
import { savePlatformOptions } from "@/app/actions/theme-appearance";
import { useFormSubmit } from "@/components/use-form-submit";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Card, CardHeader, cx } from "@/components/ui";
import { ROLES, ROLE_LABEL, type Role } from "@/lib/roles";
import type { PlatformOptions } from "@/lib/platform-options";

/** Abas Vercel/Neon e quem vê o commit em vigor. */
export function PlatformOptionsForm({ initial }: { initial: PlatformOptions }) {
  const [vercelNeon, setVercelNeon] = useState(initial.vercelNeon);
  const [roles, setRoles] = useState<Role[]>(initial.buildInfoRoles);
  const [state, form, pending] = useFormSubmit(savePlatformOptions);
  const toggle = (r: Role) => setRoles((cur) => (cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]));
  const onlyMe = roles.length === 1 && roles[0] === "superadmin";
  const changed = vercelNeon !== initial.vercelNeon || roles.slice().sort().join() !== initial.buildInfoRoles.slice().sort().join();

  return (
    <Card className="mb-6">
      <CardHeader title="Plataforma" subtitle="Integrações exibidas em Configurações e quem vê a versão em uso." />
      <form {...form} className="space-y-6 p-5">
        <input type="hidden" name="data" value={JSON.stringify({ vercelNeon, buildInfoRoles: roles })} />

        <label className="flex items-start gap-3">
          <input type="checkbox" checked={vercelNeon} onChange={(e) => setVercelNeon(e.target.checked)} className="mt-0.5 size-4 accent-[var(--brand)]" />
          <span>
            <span className="block text-sm font-medium">Mostrar as abas Vercel e Neon</span>
            <span className="mt-0.5 block text-xs text-muted">
              Com o sistema no servidor próprio, esses painéis não são mais necessários. Desligar só esconde as abas: tokens e chaves salvos continuam guardados e voltam ao religar.
            </span>
          </span>
        </label>

        <div>
          <p className="text-sm font-medium">Versão em uso (commit)</p>
          <p className="mt-0.5 text-xs text-muted">
            Aparece ao passar o mouse no canto inferior direito, no computador, com o código da última atualização publicada.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setRoles(["superadmin"])}
              aria-pressed={onlyMe}
              className={cx("rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition", onlyMe ? "bg-brand-soft text-brand ring-brand" : "ring-line hover:bg-bg-2")}
            >
              Só o superadmin
            </button>
            <button
              type="button"
              onClick={() => setRoles([])}
              aria-pressed={roles.length === 0}
              className={cx("rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition", roles.length === 0 ? "bg-brand-soft text-brand ring-brand" : "ring-line hover:bg-bg-2")}
            >
              Ninguém
            </button>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {ROLES.map((r) => (
              <label key={r} className={cx("flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm ring-1 transition", roles.includes(r) ? "bg-brand-soft ring-brand" : "ring-line hover:bg-bg-2")}>
                <input type="checkbox" checked={roles.includes(r)} onChange={() => toggle(r)} className="size-4 accent-[var(--brand)]" />
                {ROLE_LABEL[r]}
              </label>
            ))}
          </div>
        </div>

        {state?.error && <Alert>{state.error}</Alert>}
        {state?.message && <Alert tone="ok">{state.message}</Alert>}
        <SubmitButton pending={pending} pendingText="Salvando…" disabled={!changed && !state?.ok}>Salvar</SubmitButton>
      </form>
    </Card>
  );
}
