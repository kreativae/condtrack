"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
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
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    // Foco dentro da gaveta: o campo com autoFocus ou o primeiro campo visível (senão a digitação cai na página atrás)
    const focusFirst = setTimeout(() => {
      const box = panel.current;
      if (!box || box.contains(document.activeElement)) return;
      box.querySelector<HTMLElement>("input:not([type=hidden]):not([type=file]), select, textarea")?.focus();
    }, 30);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(focusFirst);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div ref={panel} className="relative flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-surface shadow-pop animate-in sm:max-w-2xl sm:rounded-3xl">
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
export function GateActions({ unit, units, carriers, locations, residents, kinds, row, shortcuts = true }: {
  unit?: { id: string; label: string }; units: UnitOption[]; carriers: string[]; locations: string[]; residents: LabelResident[]; kinds: PersonKind[];
  /** Em linha, ao lado da busca (computador): botões da altura da barra. */
  row?: boolean;
  /** Teclas R, E, L, P/A e Esc. Só uma cópia na página deve ligar (a do celular fica sem). */
  shortcuts?: boolean;
}) {
  const [open, setOpen] = useState<Action | null>(null);
  const router = useRouter();
  const unitId = unit?.id;

  // Teclas de atalho (fora de campos de texto); Esc fecha a unidade aberta
  useEffect(() => {
    if (!shortcuts) return;
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
  }, [router, unitId, shortcuts]);

  const short = unit?.label;
  // tone: cor do ícone nos blocos do celular (cada atalho reconhecível de relance)
  const tiles: { key: Action; icon: typeof DoorOpen; label: string; kbd: string; tone: string }[] = [
    { key: "parcel", icon: PackagePlus, label: "Encomenda", kbd: "R", tone: "bg-brand-soft text-brand" },
    { key: "entry", icon: DoorOpen, label: "Entrada", kbd: "E", tone: "bg-ok/12 text-ok" },
    { key: "batch", icon: Layers, label: "Lote", kbd: "L", tone: "bg-warn/12 text-warn" },
    { key: "person", icon: UserPlus, label: unit ? "Autorizar" : "Pessoa", kbd: unit ? "A" : "P", tone: "bg-info/12 text-info" },
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
      <div className={row ? "flex gap-2" : "grid grid-cols-4 gap-2"}>
        {tiles.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setOpen(t.key)}
            title={`${t.label} (tecla ${t.kbd})`}
            className={cx(
              "group relative flex items-center justify-center rounded-2xl border border-line bg-surface font-medium text-fg-2 transition hover:border-brand/40 hover:text-brand",
              row ? "h-14 gap-2 px-4 text-sm shadow-card" : "flex-col gap-1.5 px-1 py-3 text-xs font-semibold active:scale-[0.97] sm:flex-row sm:gap-2 sm:px-3 sm:py-3 sm:text-sm",
            )}
          >
            {row ? (
              <t.icon className="size-5 text-fg group-hover:text-brand" />
            ) : (
              <span className={cx("flex size-10 items-center justify-center rounded-xl sm:size-8", t.tone)}><t.icon className="size-5" /></span>
            )}
            <span className="truncate">{t.label}</span>
            {row ? (
              <kbd className="rounded border border-line px-1 font-mono text-[10px] text-muted">{t.kbd}</kbd>
            ) : (
              <kbd className="absolute right-1.5 top-1.5 hidden rounded border border-line px-1 font-mono text-[10px] text-muted lg:block">{t.kbd}</kbd>
            )}
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
export function StatChips({ items, oneLine }: { items: { label: string; value: number; href: string; tone?: "brand" | "warn" }[]; /** Ao lado da busca: uma linha só (rola de lado se faltar espaço). */ oneLine?: boolean }) {
  const router = useRouter();

  // Chegou de outra aba com "#bloco" no endereço: mostra o bloco depois de montar
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id) setTimeout(() => revealBlock(id), 150);
  }, []);

  return (
    <div className={cx("flex gap-1 overflow-x-auto xl:gap-1.5 pb-1 [scrollbar-width:none]", oneLine ? "" : "-mx-4 px-4 sm:mx-0 sm:flex-wrap sm:px-0")}>
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
            "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border py-1 text-xs font-medium transition hover:border-brand/40",
            oneLine ? "px-2.5 xl:px-3" : "px-3",
            i.value && i.tone === "warn" ? "border-warn/30 bg-warn/10 text-warn" : i.value && i.tone === "brand" ? "border-brand/30 bg-brand/10 text-brand" : "border-line bg-surface text-fg-2",
          )}
        >
          <b className="font-num text-sm">{i.value}</b>{i.label}
        </a>
      ))}
    </div>
  );
}
