"use client";

import { useSyncExternalStore } from "react";
import { Check } from "lucide-react";
import { Card, CardHeader, cx } from "./ui";

// Checklist diário local (MVP). O módulo de Inspeções/Rondas persistido entra na Fase 2.
const ITEMS = [
  "Iluminação das áreas comuns",
  "Portões e interfones",
  "Bombas d’água e reservatórios",
  "Limpeza do hall e elevadores",
  "Piscina — cloro e pH",
  "Extintores e rotas de fuga",
  "Garagem — vazamentos e lâmpadas",
];

const EVENT = "checklist-change";
function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}
function read(key: string) {
  try {
    return localStorage.getItem(key) ?? "[]";
  } catch {
    return "[]";
  }
}

export function DailyChecklist() {
  const key = `checklist-${new Date().toISOString().slice(0, 10)}`;
  const raw = useSyncExternalStore(subscribe, () => read(key), () => "[]");
  const done: number[] = JSON.parse(raw);
  function toggle(i: number) {
    const next = done.includes(i) ? done.filter((x) => x !== i) : [...done, i];
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {}
    window.dispatchEvent(new Event(EVENT));
  }
  return (
    <Card className="h-fit">
      <CardHeader title="Checklist do dia" subtitle={`${done.length} de ${ITEMS.length} conferidos`} />
      <ul className="p-2">
        {ITEMS.map((it, i) => {
          const on = done.includes(i);
          return (
            <li key={it}>
              <button onClick={() => toggle(i)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition hover:bg-fg/5">
                <span className={cx("flex size-5 items-center justify-center rounded-md ring-1 transition", on ? "bg-brand text-brand-ink ring-brand" : "ring-line-strong")}>{on && <Check className="size-3.5" />}</span>
                <span className={cx(on && "text-muted line-through")}>{it}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
