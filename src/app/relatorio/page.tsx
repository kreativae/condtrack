import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CheckCircle2, MapPin, Star } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser, type CurrentUser } from "@/lib/auth";
import { DELETED_USER, fmtDate } from "@/lib/format";
import { locationLabel } from "@/lib/orders";
import { STATUS_META, PRIORITY_META, type Priority, type Status } from "@/lib/workflow";
import { fmtDay, loadReport, parsePeriod, type ReportOrder } from "@/lib/report";
import { themeVars } from "@/lib/theme-appearance";
import { getThemeAppearance } from "@/lib/theme-appearance-server";
import { Logo } from "@/components/logo";
import { Badge, buttonClass, cx } from "@/components/ui";
import { PrintButton } from "./print-button";

// Relatório de serviços pronto para impressão (A4). Fica fora do layout do app
// (sem menu e cabeçalho) para que "Salvar como PDF" saia só com o relatório.

type SP = Record<string, string | string[] | undefined>;

/** Condomínio do relatório: o próprio (síndico/conselho) ou o escolhido (superadmin). */
async function reportCondo(user: CurrentUser, sp: SP) {
  if (user.role !== "superadmin") return user.condominiumId;
  if (typeof sp.condo !== "string") return null;
  const c = await db.condominium.findUnique({ where: { id: sp.condo }, select: { id: true } });
  return c?.id ?? null;
}

// O título vira o nome sugerido do arquivo ao salvar em PDF
export async function generateMetadata({ searchParams }: PageProps<"/relatorio">): Promise<Metadata> {
  const user = await requireUser("superadmin", "syndic", "council");
  const sp = await searchParams;
  const id = await reportCondo(user, sp);
  const condo = id ? await db.condominium.findUnique({ where: { id }, select: { name: true } }) : null;
  const p = parsePeriod(sp);
  return { title: { absolute: `Relatório de serviços - ${condo?.name ?? "Condtrack"} - ${fmtDay(p.de).split("/").join("-")} a ${fmtDay(p.ate).split("/").join("-")}` } };
}

const PRINT_CSS = `
@page {
  size: A4;
  margin: 14mm 12mm 16mm;
  @bottom-center { content: "Página " counter(page) " de " counter(pages); font: 9px ui-sans-serif, system-ui, sans-serif; color: #64748b; }
}
@media print {
  html, body { background: #fff !important; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}`;

export default async function ReportPrintPage({ searchParams }: PageProps<"/relatorio">) {
  const user = await requireUser("superadmin", "syndic", "council");
  const sp = await searchParams;
  const condoId = await reportCondo(user, sp);
  if (!condoId) redirect("/relatorios");

  const p = parsePeriod(sp);
  const photos = sp.fotos === "1";
  const showPending = sp.pendencias === "1";
  const [r, theme] = await Promise.all([loadReport(condoId, p), getThemeAppearance()]);
  const s = r.summary;
  // Sempre no tema claro (papel), com as cores de Configurações → Aparência
  const style = { ...themeVars(theme, "light"), colorScheme: "light" } as CSSProperties;

  return (
    <div style={style} className="min-h-dvh bg-bg-2 text-fg print:bg-white">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-line bg-surface/95 px-4 py-3 backdrop-blur print:hidden">
        <Link href="/relatorios" className={buttonClass("ghost")}><ArrowLeft className="size-4" />Voltar</Link>
        <p className="mr-auto text-sm text-muted">Confira o relatório e salve em PDF (na janela de impressão, escolha “Salvar como PDF”).</p>
        <PrintButton />
      </div>

      <article className="mx-auto my-6 w-full max-w-[210mm] bg-surface p-6 shadow-pop sm:p-[14mm] print:m-0 print:max-w-none print:p-0 print:shadow-none">
        {/* Cabeçalho */}
        <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-brand pb-5">
          <div>
            {r.condo.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={r.condo.logoUrl} alt="" className="mb-3 h-10 w-auto object-contain" />
            ) : (
              <div className="mb-3"><Logo size={30} /></div>
            )}
            <h1 className="font-display text-2xl font-bold leading-tight">{r.condo.name}</h1>
            {(r.condo.address || r.condo.cnpj) && (
              <p className="mt-1 text-xs text-muted">{[r.condo.address, r.condo.cnpj && `CNPJ ${r.condo.cnpj}`].filter(Boolean).join(" · ")}</p>
            )}
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand">Relatório de serviços</p>
            <p className="mt-1 font-display text-lg font-bold">{fmtDay(p.de)} a {fmtDay(p.ate)}</p>
            <p className="mt-1 text-[11px] text-muted">Gerado em {fmtDate(new Date())} por {user.name}</p>
          </div>
        </header>

        {/* Resumo */}
        <Section title="Resumo do período">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 print:grid-cols-4">
            <Num label="Serviços entregues" value={s.approved} tone="text-ok" />
            <Num label="Solicitações abertas" value={s.opened} />
            <Num label="Tempo médio até a aprovação" value={fmtHoursBR(s.avgHours)} />
            <Num label="Avaliação média" value={s.avgRating != null ? `${s.avgRating.toFixed(1).replace(".", ",")} / 5` : "—"} hint={s.ratedCount ? `${s.ratedCount} avaliação(ões)` : undefined} />
            <Num label="Devoluções para refazer" value={s.rejections} tone={s.rejections ? "text-warn" : undefined} />
            <Num label="Cancelamentos" value={s.cancellations} />
            <Num label="Em aberto hoje" value={s.pending} tone="text-info" />
            <Num label="Atrasados hoje" value={s.overdue} tone={s.overdue ? "text-bad" : undefined} />
          </div>
        </Section>

        {r.approved.length > 0 && (
          <div className="grid gap-x-6 sm:grid-cols-2 print:grid-cols-2">
            <Section title="Por categoria"><GroupTable rows={r.byCategory} head="Categoria" /></Section>
            <Section title="Por prestador"><GroupTable rows={r.byProvider} head="Prestador" /></Section>
          </div>
        )}

        {/* Serviços entregues */}
        <Section title={`Serviços entregues (${r.approved.length})`}>
          {r.approved.length ? (
            <div className="space-y-4">
              {r.approved.map((o) => <OrderBlock key={o.id} o={o} photos={photos} />)}
            </div>
          ) : (
            <p className="rounded-xl bg-bg-2 px-4 py-6 text-center text-sm text-muted">Nenhum serviço foi aprovado neste período.</p>
          )}
        </Section>

        {/* Em aberto */}
        {showPending && (
          <Section title={`Serviços em aberto (${r.pending.length})`} note="Situação no momento em que o relatório foi gerado.">
            {r.pending.length ? (
              <table className="w-full text-left text-xs">
                <thead className="border-b border-line-strong text-muted">
                  <tr><th className="py-1.5 pr-2 font-medium">Protocolo</th><th className="py-1.5 pr-2 font-medium">Serviço</th><th className="py-1.5 pr-2 font-medium">Situação</th><th className="py-1.5 pr-2 font-medium">Prioridade</th><th className="py-1.5 font-medium">Prazo</th></tr>
                </thead>
                <tbody>
                  {r.pending.map((o) => (
                    <tr key={o.id} className="break-inside-avoid border-b border-line">
                      <td className="py-1.5 pr-2 font-mono text-[11px] text-muted">{o.protocol}</td>
                      <td className="py-1.5 pr-2">{o.title}{o.category && <span className="text-muted"> · {o.category.name}</span>}</td>
                      <td className="py-1.5 pr-2">{STATUS_META[o.status as Status]?.label ?? o.status}</td>
                      <td className="py-1.5 pr-2">{PRIORITY_META[o.priority as Priority]?.label ?? o.priority}</td>
                      <td className={cx("py-1.5 whitespace-nowrap", o.overdue && "font-semibold text-bad")}>{o.dueDate ? fmtDate(o.dueDate) : "—"}{o.overdue && " (atrasado)"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="rounded-xl bg-bg-2 px-4 py-6 text-center text-sm text-muted">Nenhum serviço em aberto.</p>
            )}
          </Section>
        )}

        <footer className="mt-8 border-t border-line pt-3 text-[10px] text-muted">
          Relatório gerado pelo Condtrack. O registro completo de cada serviço, com linha do tempo e todas as fotos e vídeos, está disponível no sistema pelo número de protocolo.
        </footer>
      </article>
    </div>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="mb-3 break-after-avoid font-display text-[15px] font-bold">
        {title}
        {note && <span className="ml-2 font-sans text-[11px] font-normal text-muted">{note}</span>}
      </h2>
      {children}
    </section>
  );
}

function Num({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: string; tone?: string }) {
  return (
    <div className="break-inside-avoid rounded-xl border border-line bg-surface-2 px-3 py-2.5">
      <p className="text-[10px] leading-tight text-muted">{label}</p>
      <p className={cx("mt-1 font-display text-xl font-bold", tone)}>{value}</p>
      {hint && <p className="text-[10px] text-muted">{hint}</p>}
    </div>
  );
}

function GroupTable({ rows, head }: { rows: { name: string; count: number; avgHours: number }[]; head: string }) {
  return (
    <table className="w-full text-left text-xs">
      <thead className="border-b border-line-strong text-muted">
        <tr><th className="py-1.5 pr-2 font-medium">{head}</th><th className="py-1.5 pr-2 text-right font-medium">Serviços</th><th className="py-1.5 text-right font-medium">Tempo médio</th></tr>
      </thead>
      <tbody>
        {rows.map((g) => (
          <tr key={g.name} className="border-b border-line">
            <td className="py-1.5 pr-2">{g.name}</td>
            <td className="py-1.5 pr-2 text-right font-semibold">{g.count}</td>
            <td className="py-1.5 text-right text-fg-2">{fmtHoursBR(g.avgHours)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function OrderBlock({ o, photos }: { o: ReportOrder; photos: boolean }) {
  const pick = (phase: string) => o.media.find((m) => m.phase === phase);
  const before = pick("before") ?? pick("opening");
  const after = pick("after");
  let materials: { item: string; qty: string }[] = [];
  try {
    materials = JSON.parse(o.materialsUsed || "[]");
  } catch {
    // JSON inválido: segue sem materiais
  }
  const provider = o.assignedTo ? `${o.assignedTo.name}${o.assignedTo.company ? ` (${o.assignedTo.company})` : ""}` : DELETED_USER;

  return (
    <div className="break-inside-avoid rounded-xl border border-line p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] text-muted">{o.protocol}</p>
          <p className="font-display text-[15px] font-bold leading-snug">{o.title}</p>
          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted"><MapPin className="size-3 text-brand" />{locationLabel(o)}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {o.category && (
            <span className="rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ring-line" style={{ color: o.category.color }}>{o.category.name}</span>
          )}
          <Badge tone="ok" dot>Aprovado em {fmtDate(o.approvedAt)}</Badge>
        </div>
      </div>

      {photos && (before || after) && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {[before && { m: before, label: before.phase === "opening" ? "Ocorrência" : "Antes" }, after && { m: after, label: "Depois" }]
            .filter((x) => !!x)
            .map(({ m, label }) => (
              <figure key={m.id} className="relative aspect-[4/3] overflow-hidden rounded-lg bg-bg-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.url} alt={`${o.title} — ${label.toLowerCase()}`} className="size-full object-cover" />
                <figcaption className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white">{label}</figcaption>
              </figure>
            ))}
        </div>
      )}

      {o.serviceReport && <p className="mt-3 whitespace-pre-line text-xs text-fg-2">{o.serviceReport}</p>}
      {materials.length > 0 && (
        <p className="mt-2 text-[11px] text-fg-2"><span className="font-medium">Materiais:</span> {materials.map((m) => (m.qty ? `${m.item} (${m.qty})` : m.item)).join(", ")}</p>
      )}

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-line pt-2.5 text-[11px] sm:grid-cols-3 print:grid-cols-3">
        <Info k="Executado por" v={provider} />
        <Info k="Solicitado por" v={o.requestedBy?.name ?? DELETED_USER} />
        <Info k="Aberto em" v={fmtDate(o.createdAt)} />
        <Info k="Validado por" v={<span className="inline-flex items-center gap-1"><CheckCircle2 className="size-3 text-ok" />{o.validatedBy?.name ?? (o.validatedAt ? DELETED_USER : "—")}</span>} />
        <Info k="Aprovado por" v={o.approvedBy?.name ?? DELETED_USER} />
        <Info k="Tempo total" v={o.approvedAt ? fmtHoursBR((o.approvedAt.getTime() - o.createdAt.getTime()) / 3600_000) : "—"} />
        {o.rating != null && <Info k="Avaliação" v={<span className="inline-flex items-center gap-1"><Star className="size-3 fill-brand text-brand" />{o.rating}/5{o.ratingComment && <span className="text-muted"> — “{o.ratingComment}”</span>}</span>} />}
      </dl>
    </div>
  );
}

function Info({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted">{k}</dt>
      <dd className="truncate font-medium">{v}</dd>
    </div>
  );
}

/** Horas em texto: "18 h" ou "2,5 dias". */
function fmtHoursBR(h: number | null) {
  if (h == null) return "—";
  if (h < 1) return "menos de 1 h";
  if (h < 48) return `${Math.round(h)} h`;
  return `${(h / 24).toFixed(1).replace(".", ",")} dias`;
}
