import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { themeVars } from "@/lib/theme-appearance";
import { getThemeAppearance } from "@/lib/theme-appearance-server";
import { assemblyAccess, loadAssembly, unitsCount } from "@/lib/assembly-server";
import { ASSEMBLY_KINDS, fmtDateTimeBR, fmtMeeting, parseOptions, pct, tally, type AssemblyKind } from "@/lib/assembly";
import { Logo } from "@/components/logo";
import { buttonClass } from "@/components/ui";
import { PrintButton } from "../../print-button";

// Ata da assembleia em A4, salva pelo navegador ("Salvar como PDF"). Fora do layout do app.

export async function generateMetadata({ params }: PageProps<"/relatorio/ata/[id]">): Promise<Metadata> {
  const a = await loadAssembly((await params).id);
  return { title: { absolute: a ? `Ata - ${a.title} - ${a.condominium.name}` : "Ata" } };
}

const PRINT_CSS = `
@page {
  size: A4;
  margin: 16mm 14mm 18mm;
  @bottom-center { content: "Página " counter(page) " de " counter(pages); font: 9px ui-sans-serif, system-ui, sans-serif; color: #64748b; }
}
@media print {
  html, body { background: #fff !important; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}`;

export default async function MinutesPrintPage({ params }: PageProps<"/relatorio/ata/[id]">) {
  const user = await requireUser();
  const a = await loadAssembly((await params).id);
  if (!a || a.status !== "closed" || !assemblyAccess(user, a.condominiumId).view) notFound();
  const [total, theme] = await Promise.all([unitsCount(a.condominiumId), getThemeAppearance()]);
  const voted = new Set(a.items.flatMap((i) => i.votes.map((v) => v.unitId))).size;
  const style = { ...themeVars(theme, "light"), colorScheme: "light" } as CSSProperties;

  return (
    <div style={style} className="min-h-dvh bg-bg-2 text-fg print:bg-white">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-line bg-surface/95 px-4 py-3 backdrop-blur print:hidden">
        <Link href={`/assembleias/${a.id}`} className={buttonClass("ghost")}><ArrowLeft className="size-4" />Voltar</Link>
        <p className="mr-auto text-sm text-muted">Na janela de impressão, escolha “Salvar como PDF”.</p>
        <PrintButton />
      </div>

      <article className="mx-auto my-6 w-full max-w-[210mm] bg-surface p-6 shadow-pop sm:p-[16mm] print:m-0 print:max-w-none print:p-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-brand pb-5">
          <div>
            {a.condominium.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={a.condominium.logoUrl} alt="" className="mb-3 h-10 w-auto object-contain" />
            ) : (
              <div className="mb-3"><Logo size={30} /></div>
            )}
            <h1 className="font-display text-2xl font-bold leading-tight">{a.condominium.name}</h1>
            {(a.condominium.address || a.condominium.cnpj) && (
              <p className="mt-1 text-xs text-muted">{[a.condominium.address, a.condominium.cnpj && `CNPJ ${a.condominium.cnpj}`].filter(Boolean).join(" · ")}</p>
            )}
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand">Ata · {ASSEMBLY_KINDS[a.kind as AssemblyKind]}</p>
            <p className="mt-1 max-w-xs font-display text-lg font-bold">{a.title}</p>
            <p className="mt-1 text-[11px] text-muted first-letter:uppercase">{fmtMeeting(a.meetingAt)}</p>
          </div>
        </header>

        <section className="mt-6 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-bg-2 p-3"><p className="text-[11px] text-muted">Unidades que votaram</p><p className="font-num text-lg font-bold">{voted} de {total}</p></div>
          <div className="rounded-xl bg-bg-2 p-3"><p className="text-[11px] text-muted">Participação</p><p className="font-num text-lg font-bold">{pct(voted, total)}%</p></div>
          <div className="rounded-xl bg-bg-2 p-3"><p className="text-[11px] text-muted">Votação online</p><p className="text-xs font-semibold">{a.publishedAt ? fmtDateTimeBR(a.publishedAt) : "—"} a {a.closedAt ? fmtDateTimeBR(a.closedAt) : "—"}</p></div>
        </section>

        <section className="mt-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand">Apuração por item</h2>
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-line-strong text-left text-[11px] text-muted"><th className="py-1.5 pr-2">Item</th><th className="py-1.5 pr-2">Votos</th><th className="py-1.5">Resultado</th></tr>
            </thead>
            <tbody>
              {a.items.map((it, n) => {
                const opts = parseOptions(it.options);
                const t = tally(opts, it.votes);
                return (
                  <tr key={it.id} className="break-inside-avoid border-b border-line align-top">
                    <td className="py-2 pr-2 font-medium">{n + 1}. {it.title}</td>
                    <td className="py-2 pr-2">{opts.map((o, i) => `${o}: ${t.counts[i]} (${pct(t.counts[i], t.total)}%)`).join(" · ")}</td>
                    <td className="py-2 font-semibold">{t.winner == null ? (t.total ? "Empate" : "Sem votos") : opts[t.winner]}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <section className="mt-8">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand">Ata</h2>
          <div className="whitespace-pre-line text-[12.5px] leading-relaxed">{a.minutes || "—"}</div>
        </section>

        <section className="mt-16 grid grid-cols-2 gap-10 text-center text-[11px] text-muted break-inside-avoid">
          <div className="border-t border-fg/40 pt-1.5">Presidente da mesa</div>
          <div className="border-t border-fg/40 pt-1.5">Secretário(a)</div>
        </section>
        <p className="mt-10 text-center text-[10px] text-muted">Votação registrada no Condtrack: um voto por unidade (proprietário), com data, hora e autor guardados.</p>
      </article>
    </div>
  );
}
