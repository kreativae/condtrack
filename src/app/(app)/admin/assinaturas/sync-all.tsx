"use client";

import { useActionState } from "react";
import { RefreshCw } from "lucide-react";
import { adminSyncAll, syncPlansWithStripe, type BillingState } from "@/app/actions/billing";
import { SubmitButton } from "@/components/submit-button";

function ActionButton({ action, label }: { action: (s: BillingState) => Promise<BillingState>; label: string }) {
  const [state, run] = useActionState(action, undefined);
  return (
    <form action={run} className="flex items-center gap-2">
      {state?.error && <span className="text-xs text-bad">{state.error}</span>}
      {state?.message && <span className="text-xs text-ok">{state.message}</span>}
      <SubmitButton variant="outline" pendingText="Sincronizando…"><RefreshCw className="size-4" />{label}</SubmitButton>
    </form>
  );
}

export const SyncAllButton = () => <ActionButton action={adminSyncAll} label="Sincronizar com Stripe" />;
export const SyncPlansButton = () => <ActionButton action={syncPlansWithStripe} label="Sincronizar preços" />;
