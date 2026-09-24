"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function SecretBox({ secret }: { secret: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-line-strong bg-bg-2 px-4 py-3">
      <code className="font-num text-lg tracking-wider text-brand">{secret}</code>
      <button
        type="button"
        onClick={() => navigator.clipboard.writeText(secret).then(() => setCopied(true))}
        className="rounded-lg p-2 text-fg-2 hover:bg-fg/5"
        aria-label="Copiar"
      >
        {copied ? <Check className="size-4 text-ok" /> : <Copy className="size-4" />}
      </button>
    </div>
  );
}
