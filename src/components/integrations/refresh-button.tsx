"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { buttonClass, cx } from "@/components/ui";

export function RefreshButton({ label = "Atualizar" }: { label?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button type="button" onClick={() => start(() => router.refresh())} disabled={pending} className={buttonClass("outline", "sm")}>
      <RefreshCw className={cx("size-3.5", pending && "animate-spin")} />
      {pending ? "Atualizando…" : label}
    </button>
  );
}
