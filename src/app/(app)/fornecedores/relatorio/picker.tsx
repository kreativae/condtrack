"use client";

import { useMemo, useState } from "react";
import { ChevronDown, FileText, Trophy } from "lucide-react";
import { Button, Field, Input, cx } from "@/components/ui";
import { CategoryIcon } from "@/components/suppliers/look";
import { fmtBRL } from "@/lib/finance";

export type PickGroup = {
  id: string; title: string; label: string; category: string | null; chosenQuoteId: string | null;
  quotes: { id: string; supplier: string; amountCents: number; status: string; statusLabel: string }[];
};

/**
 * Escolha do que entra no relatório: cotações inteiras ou orçamentos soltos de cada uma.
 * Abre o relatório numa aba nova, pronto para salvar em PDF.
 */
export function ReportPicker({ groups }: { groups: PickGroup[] }) {
  const all = useMemo(() => groups.flatMap((g) => g.quotes.map((q) => q.id)), [groups]);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(all));
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState("Cotações de fornecedores");
  const [notes, setNotes] = useState(true);
  const toggle = (ids: string[], on: boolean) => setPicked((cur) => {
    const n = new Set(cur);
    for (const id of ids) {
      if (on) n.add(id);
      else n.delete(id);
    }
    return n;
  });
  const chosenGroups = groups.filter((g) => g.quotes.some((q) => picked.has(q.id))).length;
  const sum = groups.flatMap((g) => g.quotes).filter((q) => picked.has(q.id) && q.status === "approved").reduce((n, q) => n + q.amountCents, 0);

  return (
    <form action="/relatorio/orcamentos" target="_blank" className="space-y-4">
      <input type="hidden" name="ids" value={[...picked].join(",")} />
      <input type="hidden" name="obs" value={notes ? "1" : "0"} />

      {/* Dica fora da linha: assim a caixa de marcar fica alinhada com o campo do título */}
      <div>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <Field label="Título do relatório">
            <Input name="titulo" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
          </Field>
          <label className="flex h-10 items-center gap-2 whitespace-nowrap text-sm">
            <input type="checkbox" checked={notes} onChange={(e) => setNotes(e.target.checked)} className="size-4 accent-[var(--brand)]" />
            Incluir observações e motivos
          </label>
        </div>
        <p className="mt-1 text-xs text-muted">Ex.: Prestação de contas — Assembleia de novembro</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">{chosenGroups} de {groups.length} cotações · {picked.size} orçamentos</span>
        <button type="button" onClick={() => setPicked(new Set(all))} className="ml-auto text-xs font-medium text-brand hover:underline">Marcar tudo</button>
        <button type="button" onClick={() => setPicked(new Set(groups.map((g) => g.chosenQuoteId).filter((x): x is string => !!x)))} className="text-xs font-medium text-brand hover:underline">Só os contratados</button>
        <button type="button" onClick={() => setPicked(new Set())} className="text-xs font-medium text-muted hover:underline">Limpar</button>
      </div>

      <div className="space-y-2">
        {groups.map((g) => {
          const ids = g.quotes.map((q) => q.id);
          const n = ids.filter((id) => picked.has(id)).length;
          const expanded = openIds.has(g.id);
          return (
            <div key={g.id} className={cx("rounded-2xl border bg-surface shadow-card", n ? "border-brand/40" : "border-line")}>
              <div className="flex items-center gap-3 px-3 py-2.5">
                <input
                  type="checkbox"
                  aria-label={`Incluir ${g.title}`}
                  checked={n === ids.length && n > 0}
                  ref={(el) => { if (el) el.indeterminate = n > 0 && n < ids.length; }}
                  onChange={(e) => toggle(ids, e.target.checked)}
                  className="size-4 shrink-0 accent-[var(--brand)]"
                />
                <CategoryIcon category={g.category} size="sm" />
                <button type="button" onClick={() => setOpenIds((cur) => { const s = new Set(cur); if (s.has(g.id)) s.delete(g.id); else s.add(g.id); return s; })} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{g.title}</span>
                    <span className="block truncate text-xs text-muted">{g.label} · {n}/{ids.length} orçamentos</span>
                  </span>
                  <ChevronDown className={cx("size-4 shrink-0 text-muted transition", expanded && "rotate-180")} />
                </button>
              </div>
              {expanded && (
                <div className="divide-y divide-line border-t border-line">
                  {g.quotes.map((q) => (
                    <label key={q.id} className="flex cursor-pointer items-center gap-3 px-4 py-2 text-sm hover:bg-bg-2">
                      <input type="checkbox" checked={picked.has(q.id)} onChange={(e) => toggle([q.id], e.target.checked)} className="size-4 shrink-0 accent-[var(--brand)]" />
                      <span className="min-w-0 flex-1 truncate">{q.supplier}</span>
                      {q.id === g.chosenQuoteId && <Trophy className="size-3.5 shrink-0 text-ok" />}
                      <span className="shrink-0 text-xs text-muted">{q.statusLabel}</span>
                      <span className="w-24 shrink-0 text-right font-semibold tabular-nums">{fmtBRL(q.amountCents)}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] flex flex-wrap items-center justify-end gap-3 rounded-2xl border border-line bg-surface/95 p-3 shadow-pop backdrop-blur lg:bottom-4">
        {sum > 0 && <span className="mr-auto text-sm text-muted">Aprovados no relatório: <b className="text-fg">{fmtBRL(sum)}</b></span>}
        <Button type="submit" disabled={!picked.size}><FileText className="size-4" />Gerar relatório em PDF</Button>
      </div>
    </form>
  );
}
