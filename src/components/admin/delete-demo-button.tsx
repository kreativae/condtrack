"use client";

import { useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui";
import { deleteDemoCondo } from "@/app/actions/demo";

/** Exclui um condomínio de demonstração e todos os dados fictícios dele. */
export function DeleteDemoButton({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="danger"
      disabled={pending}
      onClick={() => {
        if (!confirm(`Excluir a demonstração “${name}”? Ordens de serviço, financeiro, checklist, comunicados e as pessoas fictícias serão apagados. Não dá para desfazer.`)) return;
        start(() => deleteDemoCondo(id));
      }}
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
      {pending ? "Excluindo…" : "Excluir demonstração"}
    </Button>
  );
}
