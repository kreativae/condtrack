import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { Card, cx, type Tone } from "./ui";

export type ActionItem = { href: string; icon: LucideIcon; title: string; sub: string; tone: Tone };

const iconTone: Record<Tone, string> = {
  brand: "bg-brand-soft text-brand",
  warn: "bg-warn/12 text-warn",
  ok: "bg-ok/12 text-ok",
  bad: "bg-bad/12 text-bad",
  info: "bg-info/12 text-info",
  muted: "bg-bg-2 text-muted",
};

/** "Precisa de você": o que espera uma decisão, numa lista curta com ícone colorido por assunto. */
export function ActionList({ title = "Precisa de você", items, className }: { title?: string; items: ActionItem[]; className?: string }) {
  if (!items.length) return null;
  return (
    <section className={cx("mb-6", className)}>
      <h2 className="mb-3 font-display text-lg font-semibold">{title}</h2>
      <Card className="divide-y divide-line overflow-hidden">
        {items.map((it) => (
          <Link key={it.href + it.title} href={it.href} className="flex min-h-16 items-center gap-3 px-4 py-3 transition hover:bg-bg-2">
            <span className={cx("flex size-10 shrink-0 items-center justify-center rounded-xl", iconTone[it.tone])}>
              <it.icon className="size-5" strokeWidth={1.9} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{it.title}</span>
              <span className="block truncate text-xs text-muted">{it.sub}</span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted" />
          </Link>
        ))}
      </Card>
    </section>
  );
}
