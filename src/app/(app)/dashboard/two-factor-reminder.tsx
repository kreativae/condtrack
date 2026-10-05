"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ShieldCheck, X } from "lucide-react";
import { hideTwoFactorReminder } from "@/app/actions/two-factor";

/** Lembrete das duas etapas no dashboard; o X oculta até o próximo login. */
export function TwoFactorReminder() {
  const [hidden, setHidden] = useState(false);
  const [, start] = useTransition();
  if (hidden) return null;
  return (
    <div className="mb-6 flex items-center gap-1 rounded-2xl bg-warn/10 pr-2 text-sm text-fg-2 ring-1 ring-inset ring-warn/15">
      <Link href="/perfil#duas-etapas" className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-4 py-3 hover:bg-warn/5">
        <ShieldCheck className="size-5 shrink-0 text-warn" />
        <span className="min-w-0 flex-1"><b className="text-fg">Proteja sua conta:</b> ative a verificação em duas etapas. Leva 1 minuto.</span>
        <span className="shrink-0 text-xs font-medium text-brand">Ativar →</span>
      </Link>
      <button
        type="button"
        onClick={() => {
          setHidden(true);
          start(() => hideTwoFactorReminder());
        }}
        className="shrink-0 rounded-lg p-1.5 text-muted hover:bg-warn/10 hover:text-fg"
        aria-label="Ocultar até o próximo login"
        title="Ocultar até o próximo login"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
