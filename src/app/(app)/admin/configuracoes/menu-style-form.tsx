"use client";

import { useState } from "react";
import { saveMenuStyle } from "@/app/actions/theme-appearance";
import { useFormSubmit } from "@/components/use-form-submit";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Card, CardHeader, cx } from "@/components/ui";
import { MENU_STYLES, type MenuStyle } from "@/lib/menu-style";

/** Miniatura de cada estilo: barras no formato do menu. */
function Preview({ style }: { style: MenuStyle }) {
  const bar = (w: string, on?: boolean) => <span className={cx("block h-1.5 rounded-full", w, on ? "bg-brand" : "bg-line-strong")} />;
  const label = <span className="block h-1 w-8 rounded-full bg-muted/50" />;
  return (
    <span className="flex h-24 w-full flex-col gap-1.5 overflow-hidden rounded-lg bg-bg-2 p-2.5" aria-hidden="true">
      {style === "accordion" ? (
        <>
          {label}{bar("w-3/4", true)}{bar("w-2/3")}{bar("w-1/2")}
          <span className="mt-1 flex items-center justify-between">{label}<span className="block h-1.5 w-3 rounded-full bg-line-strong" /></span>
          <span className="flex items-center justify-between">{label}<span className="block h-1.5 w-3 rounded-full bg-line-strong" /></span>
        </>
      ) : style === "more" ? (
        <>
          {bar("w-3/4", true)}{bar("w-2/3")}{bar("w-1/2")}{bar("w-2/3")}{bar("w-1/2")}
          <span className="mt-0.5 flex items-center gap-1"><span className="block h-1.5 w-1.5 rounded-full bg-muted/60" /><span className="block h-1.5 w-1.5 rounded-full bg-muted/60" /><span className="block h-1.5 w-1.5 rounded-full bg-muted/60" /></span>
        </>
      ) : (
        <span className={cx("flex flex-col", style === "compact" ? "gap-1" : "gap-2")}>
          {bar("w-3/4", true)}{bar("w-2/3")}{bar("w-1/2")}{bar("w-2/3")}{bar("w-1/2")}{bar("w-3/5")}{style === "compact" && <>{bar("w-1/2")}{bar("w-2/3")}</>}
        </span>
      )}
    </span>
  );
}

/** Estilo do menu lateral (computador) para toda a plataforma. */
export function MenuStyleForm({ initial }: { initial: MenuStyle }) {
  const [style, setStyle] = useState<MenuStyle>(initial);
  const [state, form, pending] = useFormSubmit(saveMenuStyle);
  return (
    <Card className="mb-6">
      <CardHeader title="Menu lateral" subtitle="Vale para todos os perfis, no computador. No celular o menu continua como lista." />
      <form {...form} className="space-y-4 p-5">
        <input type="hidden" name="style" value={style} />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {(Object.keys(MENU_STYLES) as MenuStyle[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setStyle(k)}
              aria-pressed={style === k}
              className={cx("flex flex-col gap-2.5 rounded-2xl p-3 text-left ring-1 transition", style === k ? "bg-brand-soft ring-2 ring-brand" : "ring-line hover:bg-bg-2")}
            >
              <Preview style={k} />
              <span>
                <span className={cx("block text-sm font-semibold", style === k && "text-brand")}>{MENU_STYLES[k].label}</span>
                <span className="mt-0.5 block text-xs text-muted">{MENU_STYLES[k].hint}</span>
              </span>
            </button>
          ))}
        </div>
        {state?.error && <Alert>{state.error}</Alert>}
        {state?.message && <Alert tone="ok">{state.message}</Alert>}
        <SubmitButton pending={pending} pendingText="Aplicando…" disabled={style === initial && !state?.ok}>Aplicar menu</SubmitButton>
      </form>
    </Card>
  );
}
