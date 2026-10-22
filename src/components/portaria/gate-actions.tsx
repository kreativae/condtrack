"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { DoorOpen, Layers, PackagePlus, UserPlus, X } from "lucide-react";
import { cx } from "@/components/ui";
import type { PersonKind } from "@/lib/booking";
import type { LabelResident } from "@/lib/parcel-label";
import type { UnitOption } from "@/lib/unit-search";
import { EntryForm, GrantForm } from "./people";
import { ReceiveParcelForm } from "./parcels";
import { BatchReceive } from "./quick";

/**
 * Gaveta: no celular sobe de baixo (como nos apps); no computador vira uma janela no centro.
 * Portal no <body> (a animação de entrada das páginas prende elementos "fixed"); Esc fecha.
 */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-surface shadow-pop animate-in sm:max-w-2xl sm:rounded-3xl">
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line-strong sm:hidden" />
        <div className="flex items-center gap-2 border-b border-line px-5 py-3">
          <p className="flex-1 font-display text-lg font-semibold">{title}</p>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-muted hover:bg-bg-2" aria-label="Fechar"><X className="size-5" /></button>
        </div>
        <div className="overflow-y-auto overscroll-contain p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

type Action = "parcel" | "entry" | "batch" | "person";

/**
 * Os quatro atalhos da portaria (Encomenda, Entrada, Lote, Pessoa), com teclas R, E, L e P (A com unidade aberta; Esc fecha a unidade).
 * Com uma unidade aberta (`unit`), encomenda, entrada e autorização já vêm com ela.
 */
export function GateActions({ unit, units, carriers, locations, residents, kinds }: {
  unit?: { id: string; label: string }; units: UnitOption[]; carriers: string[]; locations: string[]; residents: LabelResident[]; kinds: PersonKind[];
}) {
  const [open, setOpen] = useState<Action | null>(null);
  const router = useRouter();
  const unitId = unit?.id;

  // Teclas de atalho (fora de campos de texto); Esc fecha a unidade aberta
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // O alvo do evento (não o foco atual): o Esc que tira o foco da barra não deve fechar a unidade
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      if (document.querySelector('[role="dialog"]:not([inert])')) return;
      if (e.key === "Escape" && unitId) {
        router.push("/portaria");
        return;
      }
      const map: Record<string, Action> = { r: "parcel", e: "entry", l: "batch", p: "person", a: "person" };
      const a = map[e.key.toLowerCase()];
      if (a) {
        e.preventDefault();
        setOpen(a);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, unitId]);

  const short = unit?.label;
  const tiles: { key: Action; icon: typeof DoorOpen; label: string; kbd: string }[] = [
    { key: "parcel", icon: PackagePlus, label: "Encomenda", kbd: "R" },
    { key: "entry", icon: DoorOpen, label: "Entrada", kbd: "E" },
    { key: "batch", icon: Layers, label: "Lote", kbd: "L" },
    { key: "person", icon: UserPlus, label: unit ? "Autorizar" : "Pessoa", kbd: unit ? "A" : "P" },
  ];
  const titles: Record<Action, string> = {
    parcel: short ? `Receber encomenda · ${short}` : "Receber encomenda",
    entry: short ? `Registrar entrada · ${short}` : "Registrar entrada",
    batch: "Recebimento em lote",
    person: short ? `Autorizar pessoa · ${short}` : "Cadastrar pessoa e autorizar",
  };
  const close = () => setOpen(null);

  return (
    <>
      <div className="grid grid-cols-4 gap-2">
        {tiles.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setOpen(t.key)}
            className="group relative flex flex-col items-center justify-center gap-1 rounded-2xl border border-line bg-surface px-1 py-2.5 text-xs font-medium text-fg-2 transition hover:border-brand/40 hover:text-brand sm:flex-row sm:gap-2 sm:px-3 sm:py-3 sm:text-sm"
          >
            <t.icon className="size-5 text-fg group-hover:text-brand" />
            <span className="truncate">{t.label}</span>
            <kbd className="absolute right-1.5 top-1.5 hidden rounded border border-line px-1 font-mono text-[10px] text-muted lg:block">{t.kbd}</kbd>
          </button>
        ))}
      </div>

      <Sheet open={!!open} onClose={close} title={open ? titles[open] : ""}>
        {open === "parcel" && <ReceiveParcelForm units={units} carriers={carriers} locations={locations} labelUnits={units} residents={residents} fixedUnit={unit?.id} onDone={close} />}
        {open === "entry" && <EntryForm units={units} defaultUnitIds={unit ? [unit.id] : []} onDone={close} />}
        {open === "batch" && <BatchReceive units={units} carriers={carriers} locations={locations} />}
        {open === "person" && (unit ? <GrantForm units={units} kinds={kinds} fixedUnit={unit.id} onDone={close} /> : <GrantForm units={units} kinds={kinds} allowCondo openAfter />)}
      </Sheet>
    </>
  );
}

/** Leva ao bloco do painel "Agora": rola até ele, abre se estiver recolhido e pisca o contorno para o olho achar. */
function revealBlock(id: string) {
  const el = document.getElementById(id);
  if (!el) return false;
  window.dispatchEvent(new CustomEvent("gate-open", { detail: id }));
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  el.classList.add("ring-2", "ring-brand", "ring-offset-2", "ring-offset-bg");
  setTimeout(() => el.classList.remove("ring-2", "ring-brand", "ring-offset-2", "ring-offset-bg"), 1600);
  return true;
}

/** Fichas de números: uma faixa só (rola de lado no celular). Cada uma leva à lista dela. */
export function StatChips({ items }: { items: { label: string; value: number; href: string; tone?: "brand" | "warn" }[] }) {
  const router = useRouter();

  // Chegou de outra aba com "#bloco" no endereço: mostra o bloco depois de montar
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id) setTimeout(() => revealBlock(id), 150);
  }, []);

  return (
    <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
      {items.map((i) => (
        <a
          key={i.label}
          href={i.href.startsWith("#") ? `/portaria${i.href}` : i.href}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey) return;
            e.preventDefault();
            if (!i.href.startsWith("#")) return router.push(i.href);
            // O bloco só existe na aba Agora; em outra aba (ou com busca aberta), volta para ela
            const id = i.href.slice(1);
            if (revealBlock(id)) return;
            router.push(`/portaria${i.href}`);
            // Espera a aba Agora aparecer (até 4 s) e então mostra o bloco
            const started = Date.now();
            const wait = setInterval(() => {
              if (revealBlock(id) || Date.now() - started > 4000) clearInterval(wait);
            }, 100);
          }}
          className={cx(
            "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium transition hover:border-brand/40",
            i.value && i.tone === "warn" ? "border-warn/30 bg-warn/10 text-warn" : i.value && i.tone === "brand" ? "border-brand/30 bg-brand/10 text-brand" : "border-line bg-surface text-fg-2",
          )}
        >
          <b className="font-num text-sm">{i.value}</b>{i.label}
        </a>
      ))}
    </div>
  );
}
