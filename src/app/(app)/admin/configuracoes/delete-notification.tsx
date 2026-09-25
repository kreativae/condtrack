"use client";

import { useState, useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { deleteNotification } from "@/app/actions/messages";

/** Remove a notificação do sino de quem recebeu (confirmação em dois passos). */
export function DeleteNotificationButton({ id }: { id: string }) {
  const [asking, setAsking] = useState(false);
  const [pending, start] = useTransition();
  if (pending) return <Loader2 className="size-4 animate-spin text-muted" />;
  return asking ? (
    <span className="flex shrink-0 items-center gap-1 rounded-lg bg-bad/10 px-2 py-1 text-xs">
      <button type="button" onClick={() => start(async () => void (await deleteNotification(id)))} className="font-semibold text-bad">Excluir</button>
      <span className="text-muted">·</span>
      <button type="button" onClick={() => setAsking(false)} className="text-fg-2">Cancelar</button>
    </span>
  ) : (
    <button type="button" onClick={() => setAsking(true)} title="Excluir do sino do destinatário" className="shrink-0 rounded-lg p-1.5 text-muted transition hover:bg-bad/10 hover:text-bad">
      <Trash2 className="size-4" />
    </button>
  );
}
