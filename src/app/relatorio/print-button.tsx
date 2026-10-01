"use client";

import { useEffect } from "react";
import { Printer } from "lucide-react";
import { buttonClass } from "@/components/ui";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className={buttonClass("brand")}>
      <Printer className="size-4" />Salvar em PDF
    </button>
  );
}

/** Abre a janela de impressão sozinha quando a página termina de carregar (fotos e fontes). */
export function AutoPrint() {
  useEffect(() => {
    const go = () => setTimeout(() => window.print(), 300);
    if (document.readyState === "complete") go();
    else window.addEventListener("load", go, { once: true });
  }, []);
  return null;
}
