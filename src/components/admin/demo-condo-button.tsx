"use client";

import { useTransition } from "react";
import { FlaskConical, Loader2 } from "lucide-react";
import { Button } from "@/components/ui";
import { createDemoCondo } from "@/app/actions/demo";

/** Cria um condomínio de demonstração com dados fictícios (vinculado ao síndico de demonstração). */
export function DemoCondoButton() {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() => {
        if (!confirm("Criar um condomínio de demonstração com dados fictícios (OS, financeiro dos últimos 4 meses, checklist das últimas semanas) vinculado a sindico@condtrack.app?")) return;
        start(() => createDemoCondo());
      }}
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <FlaskConical className="size-4" />}
      {pending ? "Gerando dados…" : "Condomínio de demonstração"}
    </Button>
  );
}
