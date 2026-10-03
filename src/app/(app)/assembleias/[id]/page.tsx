import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { ArrowLeft, CalendarDays, Clock, FileText, MapPin, Users } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { nowMs } from "@/lib/format";
import { unitLabel } from "@/lib/units";
import { assemblyAccess, closeExpiredAssemblies, loadAssembly, unitsCount, voterUnits } from "@/lib/assembly-server";
import { ASSEMBLY_KINDS, ASSEMBLY_STATUS, fmtDateTimeBR, fmtMeeting, parseOptions, pct, tally, toLocalInput, type AssemblyKind, type AssemblyStatus } from "@/lib/assembly";
import { Badge, Card, CardHeader, PageHeader, buttonClass, cx } from "@/components/ui";
import { ManageBar } from "./manage-bar";
import { VotePanel } from "./vote-panel";
import { MinutesEditor } from "./minutes-editor";

export const metadata: Metadata = { title: "Assembleia" };

export default async function AssemblyPage({ params }: PageProps<"/assembleias/[id]">) {
  const user = await requireUser();
  const id = (await params).id;
  const a = await loadAssembly(id);
  if (!a) notFound();
  const access = assemblyAccess(user, a.condominiumId);
  if (!access.view || (a.status === "draft" && !access.manage)) notFound();
  if (a.status === "open") after(() => closeExpiredAssemblies(nowMs(), a.condominiumId).catch((e) => console.error("[assembleia]", e)));

  const [total, myUnits] = await Promise.all([unitsCount(a.condominiumId), voterUnits(user.id, a.condominiumId)]);
  const open = a.status === "open" && a.votingEndsAt.getTime() > nowMs();
  const showResults = access.manage || a.status === "closed" || a.showPartial;
  const votedUnits = new Set(a.items.flatMap((i) => i.votes.map((v) => v.unitId)));
  const items = a.items.map((i) => ({ id: i.id, title: i.title, description: i.description, options: parseOptions(i.options), votes: i.votes }));
  const st = ASSEMBLY_STATUS[a.status as AssemblyStatus] ?? ASSEMBLY_STATUS.draft;

  // Votos atuais das unidades da pessoa (para marcar o que ela já escolheu)
  const mine = Object.fromEntries(myUnits.map((u) => [u.id, Object.fromEntries(items.flatMap((i) => i.votes.filter((v) => v.unitId === u.id).map((v) => [i.id, v.option])))]));

  // Síndico: quem votou por unidade
  const byUnit = access.manage && votedUnits.size
    ? await db.unit.findMany({ where: { id: { in: [...votedUnits] } }, include: { building: true } })
    : [];
  const voters = access.manage && votedUnits.size
    ? await db.user.findMany({ where: { id: { in: [...new Set(a.items.flatMap((i) => i.votes.map((v) => v.userId)).filter((x): x is string => !!x))] } }, select: { id: true, name: true } })
    : [];

  return (
    <div className="mx-auto max-w-4xl animate-in space-y-6">
      <Link href="/assembleias" className="inline-flex items-center gap-2 text-xs font-medium text-muted hover:text-brand"><ArrowLeft className="size-3.5" /> Assembleias</Link>
      <PageHeader
        eyebrow={ASSEMBLY_KINDS[a.kind as AssemblyKind]}
        title={a.title}
        actions={a.status === "closed" && <Link href={`/relatorio/ata/${a.id}`} className={buttonClass("outline")}><FileText className="size-4" />Ata em PDF</Link>}
      />

      <Card className="grid gap-4 p-5 sm:grid-cols-2">
        <p className="flex items-start gap-2 text-sm"><CalendarDays className="mt-0.5 size-4 shrink-0 text-brand" /><span className="first-letter:uppercase">{fmtMeeting(a.meetingAt)}</span></p>
        {a.location && <p className="flex items-start gap-2 text-sm"><MapPin className="mt-0.5 size-4 shrink-0 text-brand" />{a.location}</p>}
        <p className="flex items-start gap-2 text-sm">
          <Clock className="mt-0.5 size-4 shrink-0 text-brand" />
          <span>
            <Badge tone={st.tone} dot>{st.label}</Badge>
            <span className="ml-2 text-muted">
              {a.status === "draft" ? `votação até ${fmtDateTimeBR(a.votingEndsAt)} (depois de publicar)` : a.status === "open" ? `até ${fmtDateTimeBR(a.votingEndsAt)}` : a.closedAt ? `em ${fmtDateTimeBR(a.closedAt)}` : ""}
            </span>
          </span>
        </p>
        {a.status !== "draft" && (
          <p className="flex items-start gap-2 text-sm"><Users className="mt-0.5 size-4 shrink-0 text-brand" />{votedUnits.size} de {total} unidades votaram ({pct(votedUnits.size, total)}%)</p>
        )}
        {a.description && <p className="whitespace-pre-line text-sm text-fg-2 sm:col-span-2">{a.description}</p>}
      </Card>

      {access.manage && <ManageBar id={a.id} status={a.status} votingEndsAt={toLocalInput(a.votingEndsAt)} />}

      {open && myUnits.length > 0 && (
        <VotePanel id={a.id} units={myUnits} items={items.map((i) => ({ id: i.id, title: i.title, description: i.description, options: i.options }))} mine={mine} />
      )}
      {open && !myUnits.length && !access.manage && (
        <p className="rounded-2xl bg-bg-2 px-4 py-3 text-sm text-fg-2">Só o proprietário de cada unidade vota. Se você é proprietário, peça ao síndico para registrar a sua unidade como proprietário.</p>
      )}

      <Card>
        <CardHeader title="Pauta" subtitle={showResults ? (a.status === "closed" ? "Resultado final" : "Resultado parcial") : "O resultado aparece depois do encerramento."} />
        <ol className="divide-y divide-line">
          {items.map((it, n) => {
            const t = tally(it.options, it.votes);
            return (
              <li key={it.id} className="px-5 py-4">
                <p className="font-medium"><span className="mr-2 font-num text-brand">{n + 1}.</span>{it.title}</p>
                {it.description && <p className="mt-1 whitespace-pre-line text-sm text-muted">{it.description}</p>}
                {showResults ? (
                  <div className="mt-3 space-y-1.5">
                    {it.options.map((o, i) => (
                      <div key={i} className="flex items-center gap-3 text-sm">
                        <span className={cx("w-32 shrink-0 truncate sm:w-44", t.winner === i && a.status === "closed" && "font-semibold text-ok")}>{o}</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-bg-2">
                          <div className={cx("h-full rounded-full", t.winner === i ? "bg-ok" : "bg-brand/50")} style={{ width: `${pct(t.counts[i], t.total)}%` }} />
                        </div>
                        <span className="w-20 shrink-0 text-right font-num text-xs text-muted">{t.counts[i]} · {pct(t.counts[i], t.total)}%</span>
                      </div>
                    ))}
                    {a.status === "closed" && (
                      <p className="pt-1 text-xs font-medium text-fg-2">{t.winner == null ? (t.total ? "Empate" : "Sem votos") : `Prevaleceu: ${it.options[t.winner]}`}</p>
                    )}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-muted">Opções: {it.options.join(" · ")}</p>
                )}
              </li>
            );
          })}
        </ol>
      </Card>

      {access.manage && byUnit.length > 0 && (
        <Card>
          <details>
            <summary className="cursor-pointer px-5 py-4 text-sm font-medium">Votos por unidade ({byUnit.length})</summary>
            <ul className="divide-y divide-line border-t border-line text-sm">
              {byUnit.map((u) => {
                const votes = items.map((it) => it.votes.find((v) => v.unitId === u.id));
                const who = voters.find((x) => x.id === votes.find((v) => v?.userId)?.userId)?.name;
                return (
                  <li key={u.id} className="px-5 py-3">
                    <p className="font-medium">{unitLabel(u)}{who && <span className="ml-2 text-xs font-normal text-muted">por {who}</span>}</p>
                    <p className="mt-0.5 text-xs text-muted">{items.map((it, n) => `${n + 1}. ${votes[n] ? it.options[votes[n]!.option] : "—"}`).join(" · ")}</p>
                  </li>
                );
              })}
            </ul>
          </details>
        </Card>
      )}

      {a.status === "closed" && (
        <Card>
          <CardHeader title="Ata" subtitle={a.minutesUpdatedAt ? `Atualizada em ${fmtDateTimeBR(a.minutesUpdatedAt)}` : "Rascunho gerado a partir da apuração"} />
          <div className="p-5">
            {access.manage ? <MinutesEditor id={a.id} initial={a.minutes} /> : <p className="whitespace-pre-line text-sm text-fg-2">{a.minutes || "A ata ainda não foi publicada."}</p>}
          </div>
        </Card>
      )}
    </div>
  );
}
