import {
  ArrowUpDown, Bug, Car, Droplets, Fan, Flame, Hammer, KeyRound, Leaf, Paintbrush, ShieldCheck, Sparkles, Trash2, Wifi, Wrench, Zap,
  type LucideIcon,
} from "lucide-react";

/** Ícones disponíveis para categorias de serviço (chave salva no banco). */
export const CATEGORY_ICONS: Record<string, { icon: LucideIcon; label: string }> = {
  wrench: { icon: Wrench, label: "Manutenção geral" },
  paintbrush: { icon: Paintbrush, label: "Pintura" },
  zap: { icon: Zap, label: "Elétrica" },
  droplets: { icon: Droplets, label: "Hidráulica" },
  sparkles: { icon: Sparkles, label: "Limpeza" },
  leaf: { icon: Leaf, label: "Jardinagem" },
  hammer: { icon: Hammer, label: "Serralheria / obras" },
  "arrow-up-down": { icon: ArrowUpDown, label: "Elevadores" },
  shield: { icon: ShieldCheck, label: "Segurança" },
  flame: { icon: Flame, label: "Gás / incêndio" },
  wifi: { icon: Wifi, label: "Rede / interfone" },
  key: { icon: KeyRound, label: "Portões / acesso" },
  trash: { icon: Trash2, label: "Resíduos" },
  bug: { icon: Bug, label: "Dedetização" },
  fan: { icon: Fan, label: "Ar-condicionado" },
  car: { icon: Car, label: "Garagem" },
};

export function categoryIcon(key: string | null | undefined) {
  return (CATEGORY_ICONS[key ?? ""] ?? CATEGORY_ICONS.wrench).icon;
}
