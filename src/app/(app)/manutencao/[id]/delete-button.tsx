"use client";

import { useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui";

/** Exclui o plano (as OS já abertas por ele continuam). */
export function DeletePlanButton({ action, title }: { action: () => Promise<void>; title: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="danger"
      disabled={pending}
      onClick={() => {
        if (!confirm(`Excluir o plano “${title}”? As ordens de serviço já abertas por ele continuam.`)) return;
        start(() => action());
      }}
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}Excluir
    </Button>
  );
}
