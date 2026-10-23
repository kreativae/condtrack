import {
  ArrowUpDown, Bug, Building2, Camera, Droplets, Fan, Flame, Hammer, KeyRound, Leaf, Paintbrush, Package, ShieldCheck, Sparkles,
  Store, Umbrella, Waves, Wrench, Zap, type LucideIcon,
} from "lucide-react";
import { cx } from "@/components/ui";

// Ícone e cor de cada ramo de fornecedor. Só cores do tema (aba Aparência): a cor vem do ramo, sempre a mesma.
const ICONS: [RegExp, LucideIcon][] = [
  [/pint/i, Paintbrush],
  [/el[eé]tri|ilumin/i, Zap],
  [/hidr[aá]u|encan|bomba/i, Droplets],
  [/jardin|paisag/i, Leaf],
  [/limpeza|higien/i, Sparkles],
  [/dedet|praga/i, Bug],
  [/elevador/i, ArrowUpDown],
  [/port[aã]o|automa/i, KeyRound],
  [/cftv|c[aâ]mera/i, Camera],
  [/seguran/i, ShieldCheck],
  [/piscina/i, Waves],
  [/serralh|obra|constru|reforma|vidra|marcen/i, Hammer],
  [/ar-cond|climat/i, Fan],
  [/g[aá]s|inc[eê]ndio|extint/i, Flame],
  [/imperme|telhado|calha/i, Umbrella],
  [/material|atacad|distribu/i, Package],
  [/administr|contab/i, Building2],
  [/manuten/i, Wrench],
];
const TONES = [
  "bg-brand/10 text-brand",
  "bg-info/10 text-info",
  "bg-ok/10 text-ok",
  "bg-warn/10 text-warn",
  "bg-bad/10 text-bad",
] as const;

export function categoryLook(category: string | null | undefined) {
  const c = category ?? "";
  const icon = ICONS.find(([re]) => re.test(c))?.[1] ?? Store;
  let h = 0;
  for (const ch of c.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { icon, tone: c ? TONES[h % TONES.length] : "bg-bg-2 text-muted" };
}

/** Selo quadrado com o ícone do ramo */
export function CategoryIcon({ category, size = "md", className }: { category: string | null | undefined; size?: "sm" | "md" | "lg"; className?: string }) {
  const { icon: Icon, tone } = categoryLook(category);
  return (
    <span className={cx("grid shrink-0 place-items-center", tone, size === "sm" ? "size-8 rounded-lg" : size === "lg" ? "size-14 rounded-2xl" : "size-10 rounded-xl", className)}>
      <Icon className={size === "sm" ? "size-4" : size === "lg" ? "size-7" : "size-5"} />
    </span>
  );
}
