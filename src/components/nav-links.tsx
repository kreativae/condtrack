"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Bell, Building2, LogOut, Menu, Pin, X, ClipboardList, CreditCard, FileText, Settings, Gauge, History, Home, ListChecks, Megaphone, Plus, ShieldCheck, Sparkles, Users, Wallet, type LucideIcon,
} from "lucide-react";
import clsx from "clsx";
import type { NavItem } from "@/lib/nav";
import { logout } from "@/app/actions/auth";
import { Logo } from "./logo";
import { Avatar } from "./ui";

const ICONS: Record<string, LucideIcon> = {
  gauge: Gauge, building: Building2, clipboard: ClipboardList, users: Users, shield: ShieldCheck, sparkles: Sparkles,
  megaphone: Megaphone, card: CreditCard, settings: Settings, plus: Plus, history: History, home: Home, bell: Bell, checklist: ListChecks, report: FileText, wallet: Wallet,
};

function isActive(pathname: string, href: string) {
  const base = href.split("?")[0];
  if (base === "/os") return pathname === "/os" || (pathname.startsWith("/os/") && pathname !== "/os/nova");
  return pathname === base || pathname.startsWith(base + "/");
}

export function SideNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="space-y-0.5">
      {items.map((it) => {
        const Icon = ICONS[it.icon] ?? Gauge;
        const active = isActive(pathname, it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            className={clsx(
              "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition",
              active ? "bg-brand-soft font-semibold text-brand" : "font-medium text-fg-2 hover:bg-bg-2 hover:text-fg",
            )}
          >
            <Icon className="size-[18px]" strokeWidth={active ? 2.1 : 1.8} />
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}

export const NAV_PINS_COOKIE = "nav_pins";
export const MAX_PINS = 4;
const MENU_EVENT = "condtrack:menu";

/** Atalhos do rodapé: os fixados pelo usuário (cookie) ou, sem escolha, os padrões do perfil. */
export function defaultPins(items: NavItem[]) {
  return items.filter((i) => i.mobile).slice(0, MAX_PINS).map((i) => i.href);
}

/** Botão do cabeçalho (celular) que abre o menu lateral. */
export function MenuButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(MENU_EVENT))}
      aria-label="Abrir menu"
      className="-ml-1.5 inline-flex size-9 items-center justify-center rounded-xl text-fg-2 transition hover:bg-bg-2 lg:hidden"
    >
      <Menu className="size-5" />
    </button>
  );
}

type MobileUser = { name: string; avatarUrl: string | null; roleLabel: string; place: string };

/**
 * Navegação no celular: barra de atalhos no rodapé + menu lateral com todas as páginas.
 * No menu, o alfinete fixa (ou tira) a página da barra do rodapé — guardado neste aparelho.
 */
export function MobileNav({ items, initialPins, user }: { items: NavItem[]; initialPins: string[] | null; user: MobileUser }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [pins, setPins] = useState<string[]>(() => initialPins ?? defaultPins(items));
  const [warn, setWarn] = useState(false);
  const pinned = items.filter((i) => pins.includes(i.href));

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(MENU_EVENT, show);
    return () => window.removeEventListener(MENU_EVENT, show);
  }, []);

  // Menu aberto: Esc fecha e a página de trás não rola
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle(href: string) {
    const on = pins.includes(href);
    if (!on && pins.length >= MAX_PINS) {
      setWarn(true);
      return;
    }
    setWarn(false);
    const next = on ? pins.filter((h) => h !== href) : [...pins, href];
    setPins(next);
    document.cookie = `${NAV_PINS_COOKIE}=${encodeURIComponent(next.join(","))}; path=/; max-age=31536000; samesite=lax`;
  }

  return (
    <>
      {/* Barra de atalhos */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" style={{ gridTemplateColumns: `repeat(${pinned.length + 1}, 1fr)` }}>
        {pinned.map((it) => {
          const Icon = ICONS[it.icon] ?? Gauge;
          const active = isActive(pathname, it.href);
          return (
            <Link key={it.href} href={it.href} className={clsx("flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium", active ? "text-brand" : "text-muted")}>
              <Icon className="size-5" strokeWidth={1.6} />
              <span className="max-w-full truncate px-1">{it.short ?? it.label}</span>
            </Link>
          );
        })}
        <button type="button" onClick={() => setOpen(true)} className={clsx("flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium", open ? "text-brand" : "text-muted")}>
          <Menu className="size-5" strokeWidth={1.6} />
          <span>Menu</span>
        </button>
      </nav>

      {/* Menu lateral */}
      <div className={clsx("fixed inset-0 z-50 lg:hidden", !open && "pointer-events-none")} aria-hidden={!open}>
        <div onClick={() => setOpen(false)} className={clsx("absolute inset-0 bg-black/40 transition-opacity", open ? "opacity-100" : "opacity-0")} />
        <aside
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          inert={!open}
          className={clsx(
            "absolute inset-y-0 left-0 flex w-[min(20rem,86vw)] flex-col bg-surface pb-[env(safe-area-inset-bottom)] shadow-pop transition-transform duration-200",
            open ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="flex items-center justify-between px-4 pb-3 pt-4">
            <Logo tagline={false} size={30} />
            <button type="button" onClick={() => setOpen(false)} aria-label="Fechar menu" className="inline-flex size-9 items-center justify-center rounded-xl text-fg-2 hover:bg-bg-2">
              <X className="size-5" />
            </button>
          </div>
          <div className="mx-4 mb-3 flex items-center gap-2.5 rounded-xl border border-line bg-surface-2 px-3 py-2.5">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand"><Building2 className="size-4" strokeWidth={1.8} /></span>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold">{user.place}</p>
              <p className="truncate text-[11px] text-muted">{user.roleLabel}</p>
            </div>
          </div>

          <nav className="flex-1 space-y-0.5 overflow-y-auto px-2">
            {items.map((it) => {
              const Icon = ICONS[it.icon] ?? Gauge;
              const active = isActive(pathname, it.href);
              const on = pins.includes(it.href);
              return (
                <div key={it.href} className={clsx("flex items-center rounded-xl", active && "bg-brand-soft")}>
                  <Link
                    href={it.href}
                    onClick={() => setOpen(false)}
                    className={clsx("flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-sm", active ? "font-semibold text-brand" : "font-medium text-fg-2")}
                  >
                    <Icon className="size-[18px] shrink-0" strokeWidth={active ? 2.1 : 1.8} />
                    <span className="truncate">{it.label}</span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => toggle(it.href)}
                    aria-pressed={on}
                    aria-label={on ? `Tirar ${it.label} da barra de atalhos` : `Fixar ${it.label} na barra de atalhos`}
                    title={on ? "Fixado na barra de atalhos" : "Fixar na barra de atalhos"}
                    className={clsx("mr-1 inline-flex size-9 shrink-0 items-center justify-center rounded-lg transition", on ? "text-brand" : "text-muted/60 hover:text-fg-2")}
                  >
                    {on ? <Pin className="size-4 fill-current" /> : <Pin className="size-4" />}
                  </button>
                </div>
              );
            })}
          </nav>

          <p className={clsx("px-5 py-3 text-xs", warn ? "font-medium text-warn" : "text-muted")}>
            {warn ? `A barra tem espaço para ${MAX_PINS} atalhos. Tire um alfinete antes de fixar outro.` : `Toque no alfinete para fixar até ${MAX_PINS} páginas na barra de atalhos.`}
          </p>
          <div className="space-y-1 border-t border-line p-3">
            <Link href="/perfil" onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-xl p-2 hover:bg-bg-2">
              <Avatar name={user.name} src={user.avatarUrl} size={34} />
              <div className="min-w-0 text-sm">
                <p className="truncate font-medium">{user.name}</p>
                <p className="truncate text-xs text-muted">Meu perfil</p>
              </div>
            </Link>
            <form action={logout}>
              <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-muted hover:bg-bg-2 hover:text-fg">
                <LogOut className="size-4" /> Sair
              </button>
            </form>
          </div>
        </aside>
      </div>
    </>
  );
}
