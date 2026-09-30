"use client";

import { Printer } from "lucide-react";
import { buttonClass } from "@/components/ui";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className={buttonClass("brand")}>
      <Printer className="size-4" />Salvar em PDF
    </button>
  );
}
