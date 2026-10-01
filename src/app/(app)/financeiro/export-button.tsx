"use client";

import { useState } from "react";
import { Download, FileSpreadsheet, FileText, X } from "lucide-react";
import { buttonClass } from "@/components/ui";

/** "Planilha" vira duas opções: CSV (Excel) ou PDF (pronto para imprimir/salvar). */
export function ExportButton({ query }: { query: string }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={buttonClass("outline")}>
        <Download className="size-4" />Baixar
      </button>
    );
  }
  return (
    <div className="inline-flex items-center gap-1 rounded-xl border border-line-strong bg-surface p-1 shadow-card animate-in">
      <a href={`/api/financeiro/exportar?${query}`} onClick={() => setOpen(false)} className={buttonClass("ghost", "sm")}>
        <FileSpreadsheet className="size-4 text-ok" />CSV
      </a>
      <a href={`/relatorio/financeiro?${query}`} target="_blank" rel="noopener" onClick={() => setOpen(false)} className={buttonClass("ghost", "sm")}>
        <FileText className="size-4 text-bad" />PDF
      </a>
      <button type="button" onClick={() => setOpen(false)} aria-label="Cancelar" className="inline-flex size-8 items-center justify-center rounded-lg text-muted hover:bg-bg-2">
        <X className="size-4" />
      </button>
    </div>
  );
}
