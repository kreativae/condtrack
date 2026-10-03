"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, Printer, Share2, X } from "lucide-react";
import { buttonClass } from "@/components/ui";

type Device = "ios" | "android" | "other";

const deviceOf = (): Device => {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "other";
};
const standalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

/**
 * Abre a impressão do navegador ("Salvar como PDF"). No app instalado na tela de início (principalmente
 * no iPhone) o sistema não abre a impressão: se ela não aparecer em 1,5 s, mostra o caminho certo do aparelho.
 */
function usePrint() {
  const [help, setHelp] = useState(false);
  const print = () => {
    let opened = false;
    const mark = () => (opened = true);
    window.addEventListener("beforeprint", mark, { once: true });
    const mq = window.matchMedia("print");
    const onChange = (e: MediaQueryListEvent) => e.matches && mark();
    mq.addEventListener?.("change", onChange);
    try {
      window.print();
    } catch {
      /* sem impressão neste navegador */
    }
    window.setTimeout(() => {
      window.removeEventListener("beforeprint", mark);
      mq.removeEventListener?.("change", onChange);
      if (!opened) setHelp(true);
    }, 1500);
  };
  return { print, help, closeHelp: () => setHelp(false) };
}

export function PrintButton() {
  const { print, help, closeHelp } = usePrint();
  return (
    <>
      <button type="button" onClick={print} className={buttonClass("brand")}>
        <Printer className="size-4" />Salvar em PDF
      </button>
      {help && <PrintHelp onClose={closeHelp} />}
    </>
  );
}

/** Abre a janela de impressão sozinha quando a página termina de carregar (fotos e fontes). */
export function AutoPrint() {
  const { print, help, closeHelp } = usePrint();
  useEffect(() => {
    const go = () => setTimeout(print, 300);
    if (document.readyState === "complete") go();
    else window.addEventListener("load", go, { once: true });
    // Roda uma vez ao abrir a página
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return help ? <PrintHelp onClose={closeHelp} /> : null;
}

/** Passo a passo para salvar o PDF quando o navegador não abre a impressão por conta própria. */
function PrintHelp({ onClose }: { onClose: () => void }) {
  const [device] = useState(deviceOf);
  const [inApp] = useState(standalone);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const share = () => navigator.share?.({ title: document.title, url: location.href }).catch(() => null);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4 print:hidden" role="dialog" aria-modal="true" aria-label="Como salvar em PDF">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md overflow-hidden rounded-t-3xl bg-surface pb-[env(safe-area-inset-bottom)] shadow-pop animate-in sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <p className="font-display text-lg font-semibold">Salvar em PDF</p>
          <button type="button" onClick={onClose} aria-label="Fechar" className="inline-flex size-9 items-center justify-center rounded-xl text-fg-2 hover:bg-bg-2"><X className="size-5" /></button>
        </div>
        <div className="space-y-4 px-5 py-5 text-sm text-fg-2">
          {device === "ios" ? (
            <>
              {inApp && <p>No app instalado, o iPhone não abre a impressão. Abra o relatório no navegador e salve por lá:</p>}
              <ol className="list-decimal space-y-1.5 pl-5">
                {inApp && <li>Toque em <b className="text-fg">Abrir no navegador</b> abaixo.</li>}
                <li>Toque em <b className="text-fg">Compartilhar</b> (o quadrado com a seta para cima).</li>
                <li>Escolha <b className="text-fg">Imprimir</b>.</li>
                <li>Na pré-visualização, toque em <b className="text-fg">Compartilhar</b> no topo e depois em <b className="text-fg">Salvar em Arquivos</b> (ou envie direto pelo WhatsApp ou e-mail).</li>
              </ol>
            </>
          ) : device === "android" ? (
            <ol className="list-decimal space-y-1.5 pl-5">
              {inApp && <li>Toque em <b className="text-fg">Abrir no navegador</b> abaixo.</li>}
              <li>No Chrome, toque em <b className="text-fg">⋮</b> e depois em <b className="text-fg">Compartilhar</b>.</li>
              <li>Escolha <b className="text-fg">Imprimir</b>.</li>
              <li>Em impressora, selecione <b className="text-fg">Salvar como PDF</b> e toque no ícone de PDF.</li>
            </ol>
          ) : (
            <p>Use o atalho <b className="text-fg">Ctrl + P</b> (no Mac, <b className="text-fg">⌘ + P</b>) e escolha <b className="text-fg">Salvar como PDF</b> como destino.</p>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            {inApp && (
              // Fora do app instalado, a impressão do sistema funciona
              <a href={location.href} target="_blank" rel="noopener" className={buttonClass("brand")}><ExternalLink className="size-4" />Abrir no navegador</a>
            )}
            {canShare && (
              <button type="button" onClick={share} className={buttonClass("outline")}><Share2 className="size-4" />Compartilhar link</button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
