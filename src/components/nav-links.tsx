"use client";

import Link from "next/link";
import { startTransition, useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell, Building2, LogOut, Menu, Pin, RotateCcw, X, ClipboardList, CreditCard, FileText, Settings, Gauge, History, Home, ListChecks, Megaphone, Plus, ShieldCheck, Sparkles, Users, Wallet, type LucideIcon,
} from "lucide-react";
import clsx from "clsx";
import type { NavItem } from "@/lib/nav";
import { logout } from "@/app/actions/auth";
import { saveNavOrder } from "@/app/actions/nav";
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

const HOLD_MS = 350;

/**
 * Reordenar o menu segurando e arrastando um item (mouse ou toque).
 * Um toque/clique rápido continua navegando; mover antes do tempo de segurar cancela (deixa rolar).
 * Ao soltar, a nova ordem é salva na conta do usuário.
 */
function useReorder(items: NavItem[]) {
  const router = useRouter();
  const [list, setList] = useState(items);
  const [dragging, setDragging] = useState<string | null>(null);
  // Nova ordem vinda do servidor (salvou em outro menu, restaurou o padrão…)
  const key = items.map((i) => i.href).join(",");
  const [prevKey, setPrevKey] = useState(key);
  if (key !== prevKey) {
    setPrevKey(key);
    setList(items);
  }
  const listRef = useRef(list);
  useEffect(() => {
    listRef.current = list;
  }, [list]);
  const nodes = useRef(new Map<string, HTMLElement>());
  const drag = useRef<string | null>(null);
  const press = useRef<{ x: number; y: number; timer: number; el: HTMLElement; id: number } | null>(null);
  const suppress = useRef(false);
  const container = useRef<HTMLElement | null>(null);

  // Enquanto arrasta no toque, a página não rola
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const stop = (e: TouchEvent) => drag.current && e.preventDefault();
    el.addEventListener("touchmove", stop, { passive: false });
    return () => el.removeEventListener("touchmove", stop);
  }, []);

  function end(commit: boolean) {
    if (press.current) window.clearTimeout(press.current.timer);
    press.current = null;
    const was = drag.current;
    drag.current = null;
    setDragging(null);
    if (was && commit) {
      const order = listRef.current.map((i) => i.href);
      startTransition(async () => {
        await saveNavOrder(order);
        router.refresh();
      });
    }
  }

  const handlers = (href: string) => ({
    ref: (el: HTMLElement | null) => {
      if (el) nodes.current.set(href, el);
      else nodes.current.delete(href);
    },
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      const el = e.currentTarget;
      const id = e.pointerId;
      const timer = window.setTimeout(() => {
        drag.current = href;
        suppress.current = true;
        setDragging(href);
        try {
          el.setPointerCapture(id);
        } catch {
          // o ponteiro já saiu: segue sem captura
        }
        navigator.vibrate?.(10);
      }, HOLD_MS);
      press.current = { x: e.clientX, y: e.clientY, timer, el, id };
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      const p = press.current;
      if (!drag.current) {
        // Mexeu antes de segurar: é rolagem ou clique, não arrasto
        if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 8) end(false);
        return;
      }
      const cur = listRef.current;
      const from = cur.findIndex((i) => i.href === drag.current);
      let to = from;
      cur.forEach((it, i) => {
        if (it.href === drag.current) return;
        const r = nodes.current.get(it.href)?.getBoundingClientRect();
        if (!r) return;
        const mid = r.top + r.height / 2;
        if (i < from && e.clientY < mid) to = Math.min(to, i);
        if (i > from && e.clientY > mid) to = Math.max(to, i);
      });
      if (to !== from) {
        const next = [...cur];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        listRef.current = next;
        setList(next);
      }
    },
    onPointerUp: () => end(true),
    onPointerCancel: () => end(!!drag.current),
    // Segurar não abre o menu de contexto do celular
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    // Depois de arrastar, o clique que vem junto não navega
    onClickCapture: (e: React.MouseEvent) => {
      if (suppress.current) {
        e.preventDefault();
        e.stopPropagation();
        suppress.current = false;
      }
    },
    draggable: false,
  });

  return { list, dragging, handlers, container };
}

/** Link para voltar à ordem padrão do perfil. */
function ResetOrder({ className }: { className?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(async () => { await saveNavOrder([]); router.refresh(); })}
      className={clsx("inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline disabled:opacity-50", className)}
    >
      <RotateCcw className="size-3" />Restaurar ordem padrão
    </button>
  );
}

const DRAG_CLASS = "relative z-10 scale-[1.02] bg-surface shadow-pop ring-1 ring-brand/30";
const NO_TOUCH_MENU = "select-none [-webkit-touch-callout:none]";

export function SideNav({ items, customized }: { items: NavItem[]; customized?: boolean }) {
  const pathname = usePathname();
  const { list, dragging, handlers, container } = useReorder(items);
  return (
    <nav ref={container} className="space-y-0.5" title="Segure e arraste um item para mudar a ordem">
      {list.map((it) => {
        const Icon = ICONS[it.icon] ?? Gauge;
        const active = isActive(pathname, it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            {...handlers(it.href)}
            className={clsx(
              "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition",
              NO_TOUCH_MENU,
              dragging === it.href ? DRAG_CLASS + " cursor-grabbing" : active ? "bg-brand-soft font-semibold text-brand" : "font-medium text-fg-2 hover:bg-bg-2 hover:text-fg",
              dragging === it.href && active && "font-semibold text-brand",
            )}
          >
            <Icon className="size-[18px]" strokeWidth={active ? 2.1 : 1.8} />
            {it.label}
          </Link>
        );
      })}
      {customized && <ResetOrder className="px-3 pt-2" />}
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
export function MobileNav({ items, initialPins, user, customized }: { items: NavItem[]; initialPins: string[] | null; user: MobileUser; customized?: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [pins, setPins] = useState<string[]>(() => initialPins ?? defaultPins(items));
  const [warn, setWarn] = useState(false);
  const reorder = useReorder(items);
  // No menu, o ref fica na linha inteira (para medir a posição); os eventos, no link
  const rowHandlers = (href: string) => {
    const { ref: _ref, ...rest } = reorder.handlers(href);
    void _ref;
    return rest;
  };
  const pinned = reorder.list.filter((i) => pins.includes(i.href));

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

          <nav ref={reorder.container} className="flex-1 space-y-0.5 overflow-y-auto px-2">
            {reorder.list.map((it) => {
              const Icon = ICONS[it.icon] ?? Gauge;
              const active = isActive(pathname, it.href);
              const on = pins.includes(it.href);
              return (
                <div key={it.href} ref={reorder.handlers(it.href).ref} className={clsx("flex items-center rounded-xl transition", reorder.dragging === it.href ? DRAG_CLASS : active && "bg-brand-soft")}>
                  <Link
                    href={it.href}
                    {...rowHandlers(it.href)}
                    onClick={() => setOpen(false)}
                    className={clsx("flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-sm", NO_TOUCH_MENU, active ? "font-semibold text-brand" : "font-medium text-fg-2")}
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
            {warn ? `A barra tem espaço para ${MAX_PINS} atalhos. Tire um alfinete antes de fixar outro.` : `Toque no alfinete para fixar até ${MAX_PINS} páginas na barra de atalhos. Segure e arraste para mudar a ordem.`}
            {customized && !warn && <ResetOrder className="mt-1.5 flex" />}
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
