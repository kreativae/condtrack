"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, Check, ChevronsUpDown, Globe, Loader2, Search } from "lucide-react";
import { setAdminScope } from "@/app/actions/admin-scope";
import { cx } from "./ui";

type Condo = { id: string; name: string };

/** Cartão do menu do superadmin: escolhe o condomínio em foco (ou todos) para o sistema inteiro. */
export function CondoSwitcher({ condos, current, onPicked }: { condos: Condo[]; current: Condo | null; onPicked?: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();
  const box = useRef<HTMLDivElement>(null);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? condos.filter((c) => c.name.toLowerCase().includes(t)) : condos;
  }, [condos, q]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(id: string) {
    setOpen(false);
    setQ("");
    start(async () => {
      await setAdminScope(id);
      router.refresh();
      onPicked?.();
    });
  }

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cx("flex w-full items-center gap-2.5 rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-left transition hover:border-line-strong", open && "border-brand/40 ring-2 ring-brand/15")}
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
          {pending ? <Loader2 className="size-4 animate-spin" /> : current ? <Building2 className="size-4" strokeWidth={1.8} /> : <Globe className="size-4" strokeWidth={1.8} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold">{current?.name ?? "Todos os condomínios"}</span>
          <span className="block truncate text-[11px] text-muted">{current ? "Condomínio em foco" : "Plataforma"} · trocar</span>
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted" />
      </button>

      {open && (
        <div className="absolute inset-x-0 top-full z-40 mt-1.5 overflow-hidden rounded-xl border border-line bg-surface shadow-pop animate-in">
          {condos.length > 6 && (
            <div className="relative border-b border-line">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar condomínio" className="h-9 w-full bg-transparent pl-8 pr-3 text-sm outline-none" />
            </div>
          )}
          <ul className="max-h-72 overflow-y-auto py-1">
            {!q && (
              <Option label="Todos os condomínios" icon={<Globe className="size-4" />} active={!current} onClick={() => pick("")} />
            )}
            {list.map((c) => (
              <Option key={c.id} label={c.name} icon={<Building2 className="size-4" />} active={current?.id === c.id} onClick={() => pick(c.id)} />
            ))}
            {!list.length && <li className="px-3 py-2 text-xs text-muted">Nenhum condomínio encontrado.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

function Option({ label, icon, active, onClick }: { label: string; icon: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <li>
      <button type="button" onClick={onClick} className={cx("flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-bg-2", active ? "font-semibold text-brand" : "text-fg-2")}>
        <span className="shrink-0 text-muted">{icon}</span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {active && <Check className="size-4 shrink-0" />}
      </button>
    </li>
  );
}
