import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { fmtBRL, fmtDayBR } from "@/lib/finance";
import { nowMs } from "@/lib/format";
import { groupSavings, quoteStatus } from "@/lib/suppliers";
import { supplierCondo } from "@/lib/suppliers-server";
import { themeVars } from "@/lib/theme-appearance";
import { getThemeAppearance } from "@/lib/theme-appearance-server";
import { Logo } from "@/components/logo";
import { buttonClass, cx } from "@/components/ui";
import { PrintButton } from "../print-button";

// Relatório de cotações (orçamentos escolhidos pelo síndico) em A4, salvo pelo navegador ("Salvar como PDF").
// Fora do layout do app, como os outros relatórios. ?ids=a,b,c (orçamentos) ou ?grupo=<cotação>.

export const metadata: Metadata = { title: { absolute: "Relatório de cotações" } };

const PRINT_CSS = `
@page {
  size: A4;
  margin: 14mm 12mm 16mm;
  @bottom-center { content: "Página " counter(page) " de " counter(pages); font: 9px ui-sans-serif, system-ui, sans-serif; color: #64748b; }
}
@media print {
  html, body { background: #fff !important; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  thead { display: table-header-group; }
}`;

export default async function QuotesReportPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser("superadmin", "syndic");
  const sp = await searchParams;
  const ids = (sp.ids ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 500);
  const condoScope = await supplierCondo(user);
  const notes = sp.obs !== "0";
  const title = (sp.titulo ?? "").trim().slice(0, 120) || "Cotações de fornecedores";

  const quotes = await db.supplierQuote.findMany({
    where: sp.grupo ? { groupId: sp.grupo, status: { not: "cancelled" } } : { id: { in: ids } },
    include: { supplier: true, group: true, _count: { select: { files: true } } },
    orderBy: { amountCents: "asc" },
  });
  // Tudo do mesmo condomínio de quem pede (superadmin: o do condomínio em foco, ou o dos orçamentos)
  const condoId = condoScope ?? (user.role === "superadmin" ? quotes[0]?.condominiumId : null);
  const mine = quotes.filter((q) => q.condominiumId === condoId);
  if (!condoId || !mine.length) redirect("/fornecedores/relatorio");

  const [condo, theme] = await Promise.all([
    db.condominium.findUnique({ where: { id: condoId }, select: { name: true, address: true, cnpj: true, logoUrl: true } }),
    getThemeAppearance(),
  ]);
  const now = nowMs();

  // Agrupa por cotação, na ordem em que as cotações foram criadas
  const byGroup = new Map<string, typeof mine>();
  for (const q of mine) byGroup.set(q.groupId ?? `solo-${q.id}`, [...(byGroup.get(q.groupId ?? `solo-${q.id}`) ?? []), q]);
  const sections = [...byGroup.values()]
    .map((list) => ({ group: list[0].group, title: list[0].group?.title ?? list[0].title, list }))
    .sort((a, b) => (a.group?.createdAt.getTime() ?? 0) - (b.group?.createdAt.getTime() ?? 0));

  const chosenOf = (s: (typeof sections)[number]) => s.list.find((q) => q.id === s.group?.chosenQuoteId) ?? null;
  const contracted = sections.reduce((n, s) => n + (chosenOf(s)?.amountCents ?? 0), 0);
  const saved = sections.reduce((n, s) => n + (groupSavings(chosenOf(s), s.list)?.vsMax ?? 0), 0);
  const closedCount = sections.filter((s) => s.group?.status === "closed").length;

  await audit(user, "report", "quote_group", sp.grupo ?? null, { new: { relatorio: title, cotacoes: sections.length, orcamentos: mine.length }, condominiumId: condoId });
  const style = { ...themeVars(theme, "light"), colorScheme: "light" } as CSSProperties;

  return (
    <div style={style} className="min-h-dvh bg-bg-2 text-fg print:bg-white">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-line bg-surface/95 px-4 py-3 backdrop-blur print:hidden">
        <Link href={sp.grupo ? `/fornecedores/cotacao/${sp.grupo}` : "/fornecedores/relatorio"} className={buttonClass("ghost")}><ArrowLeft className="size-4" />Voltar</Link>
        <p className="mr-auto text-sm text-muted">Na janela de impressão, escolha “Salvar como PDF”.</p>
        <PrintButton />
      </div>

      <article className="mx-auto my-6 w-full max-w-[210mm] bg-surface p-6 shadow-pop sm:p-[14mm] print:m-0 print:max-w-none print:p-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-brand pb-5">
          <div>
            {condo?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={condo.logoUrl} alt="" className="mb-3 h-10 w-auto object-contain" />
            ) : (
              <div className="mb-3"><Logo size={30} /></div>
            )}
            <h1 className="font-display text-2xl font-bold leading-tight">{condo?.name}</h1>
            {(condo?.address || condo?.cnpj) && <p className="mt-1 text-xs text-muted">{[condo?.address, condo?.cnpj && `CNPJ ${condo.cnpj}`].filter(Boolean).join(" · ")}</p>}
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand">Relatório de cotações</p>
            <p className="mt-1 max-w-xs font-display text-lg font-bold">{title}</p>
            <p className="mt-1 text-[11px] text-muted">Gerado em {fmtDayBR(new Date(now))} por {user.name}</p>
          </div>
        </header>

        <Section title="Resumo">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 print:grid-cols-4">
            <Num label="Cotações" value={String(sections.length)} hint={`${closedCount} encerrada${closedCount === 1 ? "" : "s"}`} />
            <Num label="Orçamentos" value={String(mine.length)} />
            <Num label="Contratado" value={fmtBRL(contracted)} tone="text-ok" />
            <Num label="Economia frente ao mais caro" value={fmtBRL(saved)} tone={saved ? "text-ok" : undefined} />
          </div>
        </Section>

        {sections.map((s) => {
          const chosen = chosenOf(s);
          const sv = groupSavings(chosen, s.list);
          const state = !s.group ? "" : s.group.status === "open" ? "Em andamento" : chosen ? "Encerrada · contratado" : "Encerrada sem contratação";
          return (
            <section key={s.title + s.list[0].id} className="mt-7 break-inside-avoid-page">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="break-after-avoid font-display text-[15px] font-bold">{s.title}</h2>
                <p className="text-[11px] text-muted">{[state, s.group?.closedAt && `encerrada em ${fmtDayBR(s.group.closedAt)}${s.group.closedByName ? ` por ${s.group.closedByName}` : ""}`].filter(Boolean).join(" · ")}</p>
              </div>
              {s.group?.description && notes && <p className="mb-2 text-[11px] text-fg-2">{s.group.description}</p>}
              <table className="w-full text-left text-[11px]">
                <thead className="border-b border-line-strong text-muted">
                  <tr>
                    <th className="py-1.5 pr-2 font-medium">Fornecedor</th>
                    <th className="py-1.5 pr-2 font-medium">Prazo</th>
                    <th className="py-1.5 pr-2 font-medium">Pagamento</th>
                    <th className="py-1.5 pr-2 font-medium">Situação</th>
                    <th className="py-1.5 text-right font-medium">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {s.list.map((q) => {
                    const isChosen = q.id === chosen?.id;
                    return (
                      <tr key={q.id} className={cx("break-inside-avoid border-b border-line align-top", isChosen && "bg-ok/10")}>
                        <td className="py-1.5 pr-2">
                          <span className="font-medium">{q.supplier.name}</span>
                          <span className="block text-muted">{[q.supplier.document && `CNPJ/CPF ${q.supplier.document}`, `cadastrado em ${fmtDayBR(q.createdAt)}`, q._count.files > 0 && `${q._count.files} arquivo(s)`].filter(Boolean).join(" · ")}</span>
                          {notes && q.decisionNote && q.status !== "pending" && <span className="block italic text-fg-2">“{q.decisionNote}”</span>}
                        </td>
                        <td className="py-1.5 pr-2 text-fg-2">{q.deadline ?? "—"}</td>
                        <td className="py-1.5 pr-2 text-fg-2">{q.paymentTerms ?? "—"}</td>
                        <td className={cx("whitespace-nowrap py-1.5 pr-2", isChosen && "font-semibold text-ok")}>{isChosen ? "Contratado" : quoteStatus(q.status).short}</td>
                        <td className={cx("whitespace-nowrap py-1.5 text-right font-semibold tabular-nums", q.status === "rejected" && "text-muted")}>{fmtBRL(q.amountCents)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {(sv || (notes && s.group?.closingNote)) && (
                <div className="mt-2 rounded-xl bg-surface-2 px-3 py-2 text-[11px] text-fg-2">
                  {sv && sv.vsMax > 0 && <p>Economia de <b>{fmtBRL(sv.vsMax)}</b> frente ao orçamento mais caro{sv.vsAvg > 0 && <> e de <b>{fmtBRL(sv.vsAvg)}</b> frente à média dos {sv.received} recebidos</>}.</p>}
                  {notes && s.group?.closingNote && <p>Decisão: “{s.group.closingNote}”</p>}
                </div>
              )}
            </section>
          );
        })}

        <footer className="mt-8 border-t border-line pt-3 text-[10px] text-muted">
          Valores conforme os orçamentos enviados pelos fornecedores. Orçamentos cancelados não aparecem. Os arquivos de cada orçamento e o histórico das decisões estão no Condtrack.
        </footer>
      </article>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="mb-3 break-after-avoid font-display text-[15px] font-bold">{title}</h2>
      {children}
    </section>
  );
}

function Num({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className="break-inside-avoid rounded-xl border border-line bg-surface-2 px-3 py-2.5">
      <p className="text-[10px] leading-tight text-muted">{label}</p>
      <p className={cx("mt-1 font-display text-base font-bold tabular-nums", tone)}>{value}</p>
      {hint && <p className="text-[10px] text-muted">{hint}</p>}
    </div>
  );
}
