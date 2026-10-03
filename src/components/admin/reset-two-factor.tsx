"use client";

import { useTransition } from "react";
import { Loader2, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui";
import { adminResetTwoFactor } from "@/app/actions/two-factor";

/** Superadmin: desliga as duas etapas de quem perdeu o celular e os códigos de recuperação. */
export function ResetTwoFactorButton({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (!confirm(`Desligar a verificação em duas etapas de ${name}? Use só depois de confirmar a identidade da pessoa. Ela entra só com a senha e pode ativar de novo em Meu perfil.`)) return;
        start(() => adminResetTwoFactor(id));
      }}
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <ShieldOff className="size-4" />}Desligar duas etapas
    </Button>
  );
}
