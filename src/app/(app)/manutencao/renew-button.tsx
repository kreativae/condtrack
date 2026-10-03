"use client";

import { useId, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Input, buttonClass } from "@/components/ui";

/** "Renovado": pede a nova data de vencimento (vazio = um ciclo à frente). */
export function RenewButton({ action }: { action: (form: FormData) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={buttonClass("outline", "sm")}>
        <RefreshCw className="size-4" />Renovado
      </button>
    );
  }
  return (
    <form action={async (f) => { await action(f); setOpen(false); }} className="flex flex-wrap items-center gap-2">
      <label className="text-xs text-muted" htmlFor={id}>Novo vencimento</label>
      <Input id={id} name="nextDue" type="date" required className="h-8 w-40 text-xs" />
      <button className={buttonClass("brand", "sm")}>Salvar</button>
      <button type="button" onClick={() => setOpen(false)} className={buttonClass("ghost", "sm")}>Cancelar</button>
    </form>
  );
}
