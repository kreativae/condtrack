import { createElement } from "react";
import { CircleHelp, Lightbulb, MessageSquareWarning, Users, Wrench, type LucideIcon } from "lucide-react";
import { cx } from "@/components/ui";
import type { TicketKind } from "@/lib/tickets";

// Ícone e cor de cada tipo de chamado (só cores do tema)
const LOOK: Record<TicketKind, { icon: LucideIcon; tone: string }> = {
  problem: { icon: Wrench, tone: "bg-warn/10 text-warn" },
  complaint: { icon: MessageSquareWarning, tone: "bg-bad/10 text-bad" },
  neighbor: { icon: Users, tone: "bg-info/10 text-info" },
  suggestion: { icon: Lightbulb, tone: "bg-ok/10 text-ok" },
  other: { icon: CircleHelp, tone: "bg-bg-2 text-fg-2" },
};
export const kindLook = (kind: string) => LOOK[kind as TicketKind] ?? LOOK.other;

export function TicketKindIcon({ kind, size = "md", className }: { kind: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const look = kindLook(kind);
  return (
    <span className={cx("grid shrink-0 place-items-center", size === "sm" ? "size-7 rounded-lg" : size === "lg" ? "size-12 rounded-2xl" : "size-10 rounded-xl", look.tone, className)}>
      {createElement(look.icon, { className: size === "sm" ? "size-3.5" : size === "lg" ? "size-6" : "size-5" })}
    </span>
  );
}
