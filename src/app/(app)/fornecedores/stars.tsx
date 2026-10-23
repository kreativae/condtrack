import { Star } from "lucide-react";
import { cx } from "@/components/ui";

/** Avaliação do fornecedor (1 a 5); sem nota não mostra nada */
export function Stars({ value, size = "size-3.5" }: { value: number | null; size?: string }) {
  if (!value) return null;
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} de 5`}>
      {[1, 2, 3, 4, 5].map((n) => <Star key={n} className={cx(size, n <= value ? "fill-warn text-warn" : "text-line-strong")} />)}
    </span>
  );
}
