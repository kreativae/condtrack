"use client";

import { useActionState } from "react";
import { DoorOpen, Loader2 } from "lucide-react";
import { addGateDemoAction, type GateDemoState } from "@/app/actions/demo";
import { Alert, Button } from "@/components/ui";

/** Superadmin: porteiro, reservas e entradas fictícias num condomínio que já existe (só onde ainda não há reservas). */
export function GateDemoButton({ id, name }: { id: string; name: string }) {
  const [state, run, pending] = useActionState((p: GateDemoState) => addGateDemoAction(id, p), null);
  return (
    <div className="space-y-2">
      <form
        action={run}
        onSubmit={(e) => {
          if (!confirm(`Gerar dados FICTÍCIOS de portaria em “${name}”?\n\nEntram: um porteiro fictício, pessoas nas unidades, reservas (passadas, de hoje e futuras) com convidados e entradas dos últimos 7 dias. Áreas de festa, churrasqueira, piscina e quadra viram reserváveis.\n\nUse só em condomínio de apresentação.`)) e.preventDefault();
        }}
      >
        <Button variant="outline" disabled={pending || !!state?.message}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <DoorOpen className="size-4" />}
          {pending ? "Gerando…" : "Gerar portaria e reservas fictícias"}
        </Button>
      </form>
      {state?.error && <Alert>{state.error}</Alert>}
      {state?.message && <Alert tone="ok">{state.message}</Alert>}
    </div>
  );
}
