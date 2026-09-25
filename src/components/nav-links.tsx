"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell, Building2, ClipboardList, CreditCard, Settings, Gauge, History, Home, ListChecks, Megaphone, Plus, ShieldCheck, Sparkles, Users, type LucideIcon,
} from "lucide-react";
import clsx from "clsx";
import type { NavItem } from "@/lib/nav";

const ICONS: Record<string, LucideIcon> = {
  gauge: Gauge, building: Building2, clipboard: ClipboardList, users: Users, shield: ShieldCheck, sparkles: Sparkles,
  megaphone: Megaphone, card: CreditCard, settings: Settings, plus: Plus, history: History, home: Home, bell: Bell, checklist: ListChecks,
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

export function BottomNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const list = items.filter((i) => i.mobile).slice(0, 5);
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 grid border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" style={{ gridTemplateColumns: `repeat(${list.length}, 1fr)` }}>
      {list.map((it) => {
        const Icon = ICONS[it.icon] ?? Gauge;
        const active = isActive(pathname, it.href);
        return (
          <Link key={it.href} href={it.href} className={clsx("flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium", active ? "text-brand" : "text-muted")}>
            <Icon className="size-5" strokeWidth={1.6} />
            <span className="max-w-full truncate px-1">{it.short ?? it.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
