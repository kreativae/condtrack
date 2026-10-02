"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Download, Eye, FileBarChart, FileSpreadsheet, FileText, X } from "lucide-react";
import { Field, Input, Select, buttonClass, cx } from "@/components/ui";

type Preset = "mes" | "mes-anterior" | "trimestre" | "ano" | "outro-mes" | "personalizado";
const PRESETS: { key: Preset; label: string }[] = [
  { key: "mes", label: "Este mês" },
  { key: "mes-anterior", label: "Mês passado" },
  { key: "trimestre", label: "Últimos 3 meses" },
  { key: "ano", label: "Este ano" },
  { key: "outro-mes", label: "Escolher mês" },
  { key: "personalizado", label: "Personalizado" },
];
const SITUACOES = { "": "Todas as situações", paid: "Pagos", pending: "Pendentes", overdue: "Vencidos", cancelled: "Cancelados" };

const ymd = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);

/** De/até (YYYY-MM-DD) de cada atalho, a partir de hoje (Brasília). */
function range(preset: Preset, today: string, month: string, de: string, ate: string): [string, string] {
  const [y, m] = today.split("-").map(Number);
  switch (preset) {
    case "mes-anterior": return [ymd(y, m - 1, 1), ymd(y, m, 0)];
    case "trimestre": return [ymd(y, m - 2, 1), ymd(y, m + 1, 0)];
    case "ano": return [`${y}-01-01`, `${y}-12-31`];
    case "outro-mes": {
      const [yy, mm] = month.split("-").map(Number);
      return [ymd(yy, mm, 1), ymd(yy, mm + 1, 0)];
    }
    case "personalizado": return [de, ate];
    default: return [ymd(y, m, 1), ymd(y, m + 1, 0)];
  }
}

type CondoOption = { id: string; name: string; categories: string[] };

/** Botão "Relatório" do Financeiro: abre o painel numa janela. */
export function ReportDialog({ categories, condoId, today }: { categories: string[]; condoId?: string; today: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonClass("outline")}>
        <FileBarChart className="size-4" />Relatório
      </button>

      {/* Portal no <body>: a animação de entrada da página prende elementos "fixed" dentro dela */}
      {open && createPortal(
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Relatório financeiro">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="relative flex max-h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl bg-surface shadow-pop animate-in sm:rounded-3xl">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div>
                <p className="font-display text-lg font-semibold">Relatório financeiro</p>
                <p className="text-xs text-muted">Escolha o período e os lançamentos.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Fechar" className="inline-flex size-9 items-center justify-center rounded-xl text-fg-2 hover:bg-bg-2"><X className="size-5" /></button>
            </div>
            <FinanceReportPanel categories={categories} condoId={condoId} today={today} scroll />
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

/**
 * Opções do relatório financeiro (período, tipo, situação, categorias) e os botões
 * Visualizar / Baixar (CSV ou PDF). Usado na janela do Financeiro e em Relatórios.
 * `condos`: o superadmin escolhe o condomínio (cada um com as suas categorias).
 */
export function FinanceReportPanel({
  categories: baseCategories,
  condoId: baseCondoId,
  condos,
  initialCondo,
  today,
  scroll,
}: {
  categories?: string[];
  condoId?: string;
  condos?: CondoOption[];
  /** Superadmin: começa no condomínio em foco do menu. */
  initialCondo?: string;
  today: string;
  scroll?: boolean;
}) {
  const [condoSel, setCondoSel] = useState(initialCondo && condos?.some((c) => c.id === initialCondo) ? initialCondo : "");
  const condo = condos?.find((c) => c.id === condoSel);
  const categories = useMemo(() => (condos ? condo?.categories ?? [] : baseCategories ?? []), [condos, condo, baseCategories]);
  const condoId = condos ? condo?.id : baseCondoId;
  const [preset, setPreset] = useState<Preset>("mes");
  const [month, setMonth] = useState(today.slice(0, 7));
  const [de, setDe] = useState(today.slice(0, 8) + "01");
  const [ate, setAte] = useState(today);
  const [tipo, setTipo] = useState<"" | "income" | "expense">("");
  const [situacao, setSituacao] = useState("");
  // Guarda as DESMARCADAS (vazio = todas), para continuar certo ao trocar de condomínio
  const [off, setOff] = useState<string[]>([]);
  const cats = useMemo(() => categories.filter((c) => !off.includes(c)), [categories, off]);
  const [download, setDownload] = useState(false);

  const [from, to] = range(preset, today, month, de, ate);
  const valid = !!from && !!to && from <= to && (categories.length === 0 || cats.length > 0) && (!condos || !!condo);
  const query = useMemo(() => {
    const q = new URLSearchParams();
    if (condoId) q.set("condo", condoId);
    q.set("de", from);
    q.set("ate", to);
    if (tipo) q.set("tipo", tipo);
    if (situacao) q.set("situacao", situacao);
    // Só filtra categoria quando nem todas estão marcadas
    if (cats.length && cats.length < categories.length) q.set("cats", cats.join("|"));
    return q.toString();
  }, [condoId, from, to, tipo, situacao, cats, categories.length]);

  const toggleCat = (c: string) => setOff((x) => (x.includes(c) ? x.filter((y) => y !== c) : [...x, c]));
  const allCats = cats.length === categories.length;
  const off_ = !valid && "pointer-events-none opacity-50";

  return (
    <>
      <div className={cx("space-y-5 px-5 py-5 sm:px-6", scroll && "flex-1 overflow-y-auto")}>
        {condos && (
          <Field label="Condomínio">
            <Select value={condoSel} onChange={(e) => { setCondoSel(e.target.value); setOff([]); }}>
              <option value="" disabled>Selecione…</option>
              {condos.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
        )}

        {/* Período */}
        <div>
          <p className="mb-2 text-[13px] font-medium text-fg-2">Período</p>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPreset(p.key)}
                className={cx("rounded-full border px-3 py-1.5 text-xs font-medium transition", preset === p.key ? "border-brand bg-brand-soft text-brand" : "border-line-strong text-fg-2 hover:bg-bg-2")}
              >
                {p.label}
              </button>
            ))}
          </div>
          {preset === "outro-mes" && (
            <div className="mt-3 max-w-56"><Input type="month" value={month} max={today.slice(0, 7)} onChange={(e) => e.target.value && setMonth(e.target.value)} aria-label="Mês" /></div>
          )}
          {preset === "personalizado" && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field label="De"><Input type="date" value={de} onChange={(e) => setDe(e.target.value)} /></Field>
              <Field label="Até"><Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></Field>
            </div>
          )}
          {from && to && <p className="mt-2 text-xs text-muted">De {from.split("-").reverse().join("/")} a {to.split("-").reverse().join("/")}</p>}
          {preset === "personalizado" && from > to && <p className="mt-1 text-xs text-bad">A data inicial é depois da final.</p>}
        </div>

        {/* Tipo e situação */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-[13px] font-medium text-fg-2">Lançamentos</p>
            <div className="inline-flex w-full rounded-xl bg-bg-2 p-1">
              {([["", "Todos"], ["income", "Receitas"], ["expense", "Despesas"]] as const).map(([k, l]) => (
                <button key={k} type="button" onClick={() => setTipo(k)} className={cx("flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition", tipo === k ? "bg-surface text-fg shadow-card" : "text-muted hover:text-fg")}>{l}</button>
              ))}
            </div>
          </div>
          <Field label="Situação">
            <Select value={situacao} onChange={(e) => setSituacao(e.target.value)}>
              {Object.entries(SITUACOES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </Select>
          </Field>
        </div>

        {/* Categorias */}
        {categories.length > 0 && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[13px] font-medium text-fg-2">Categorias <span className="text-muted">({allCats ? "todas" : `${cats.length} de ${categories.length}`})</span></p>
              <button type="button" onClick={() => setOff(allCats ? categories : [])} className="text-xs font-medium text-brand hover:underline">{allCats ? "Desmarcar todas" : "Marcar todas"}</button>
            </div>
            <div className="grid max-h-48 gap-1 overflow-y-auto rounded-xl border border-line p-2 sm:grid-cols-2">
              {categories.map((c) => (
                <label key={c} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-bg-2">
                  <input type="checkbox" checked={cats.includes(c)} onChange={() => toggleCat(c)} className="size-4 accent-[var(--brand)]" />
                  <span className="truncate">{c}</span>
                </label>
              ))}
            </div>
            {!cats.length && <p className="mt-1 text-xs text-bad">Marque pelo menos uma categoria.</p>}
          </div>
        )}
      </div>

      {/* Ações */}
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-6">
        {download ? (
          <div className="inline-flex items-center gap-1 rounded-xl border border-line-strong bg-surface p-1 animate-in">
            <a href={valid ? `/api/financeiro/exportar?${query}` : undefined} onClick={() => setDownload(false)} className={cx(buttonClass("ghost", "sm"), off_)}>
              <FileSpreadsheet className="size-4 text-ok" />CSV
            </a>
            <a href={valid ? `/relatorio/financeiro?${query}&imprimir=1` : undefined} target="_blank" rel="noopener" onClick={() => setDownload(false)} className={cx(buttonClass("ghost", "sm"), off_)}>
              <FileText className="size-4 text-bad" />PDF
            </a>
            <button type="button" onClick={() => setDownload(false)} aria-label="Cancelar" className="inline-flex size-8 items-center justify-center rounded-lg text-muted hover:bg-bg-2"><X className="size-4" /></button>
          </div>
        ) : (
          <button type="button" disabled={!valid} onClick={() => setDownload(true)} className={buttonClass("outline")}>
            <Download className="size-4" />Baixar
          </button>
        )}
        <a href={valid ? `/relatorio/financeiro?${query}` : undefined} target="_blank" rel="noopener" className={cx(buttonClass("brand"), off_)}>
          <Eye className="size-4" />Visualizar relatório
        </a>
      </div>
    </>
  );
}
