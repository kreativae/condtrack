"use client";

import { Children, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { buttonClass, cx } from "./ui";

/** Mostra os primeiros `limit` itens e um botão para revelar o restante. */
export function ShowMore({ children, limit = 10, label = "Mostrar mais", className, as: Tag = "ol" }: { children: ReactNode; limit?: number; label?: string; className?: string; as?: "ol" | "ul" }) {
  const items = Children.toArray(children);
  const [all, setAll] = useState(false);
  const hidden = items.length - limit;
  return (
    <>
      <Tag className={className}>{all ? items : items.slice(0, limit)}</Tag>
      {hidden > 0 && !all && (
        <div className="px-5 pb-5">
          <button type="button" onClick={() => setAll(true)} className={cx(buttonClass("outline", "sm"), "w-full")}>
            <ChevronDown className="size-3.5" />{label} ({hidden})
          </button>
        </div>
      )}
    </>
  );
}
