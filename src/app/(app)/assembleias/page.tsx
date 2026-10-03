import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import { CalendarDays, Plus, Vote } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { adminScope } from "@/lib/admin-scope-server";
import { nowMs } from "@/lib/format";
import { assemblyAccess, closeExpiredAssemblies, unitsCount, voterUnits } from "@/lib/assembly-server";
import { ASSEMBLY_KINDS, ASSEMBLY_STATUS, fmtDateTimeBR, fmtMeeting, pct, type AssemblyKind, type AssemblyStatus } from "@/lib/assembly";
import { Badge, Card, Empty, LinkButton, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Assembleias" };

export default async function AssembliesPage() {
  const user = await requireUser("superadmin", "syndic", "council", "resident", "caretaker");
  const scope = await adminScope(user);
  const condoId = user.role === "superadmin" ? scope?.id : user.condominiumId;
  if (!condoId) {
    return (
      <div className="animate-in">
        <PageHeader eyebrow="Condomínio" title="Assembleias" />
        <Card><Empty icon={<Vote className="size-8" />} title="Escolha um condomínio">Use o cartão do condomínio no menu para ver as assembleias dele.</Empty></Card>
      </div>
    );
  }
  const access = assemblyAccess(user, condoId);
  after(() => closeExpiredAssemblies(nowMs(), condoId).catch((e) => console.error("[assembleia]", e)));

  const [list, total, myUnits] = await Promise.all([
    db.assembly.findMany({
      // Rascunhos só para quem organiza
      where: { condominiumId: condoId, ...(access.manage ? {} : { status: { not: "draft" } }) },
      include: { _count: { select: { items: true } }, votes: { select: { unitId: true }, distinct: ["unitId"] } },
      orderBy: { meetingAt: "desc" },
    }),
    unitsCount(condoId),
    voterUnits(user.id, condoId),
  ]);

  return (
    <div className="animate-in">
      <PageHeader
        eyebrow={scope?.name ?? "Condomínio"}
        title="Assembleias"
        description={myUnits.length ? "Convocações, votação online por unidade e atas. Você vota como proprietário." : "Convocações, votação online por unidade e atas."}
        actions={access.manage && <LinkButton href="/assembleias/nova"><Plus className="size-4" />Nova assembleia</LinkButton>}
      />
      {!list.length ? (
        <Card>
          <Empty icon={<Vote className="size-8" />} title="Nenhuma assembleia ainda">
            {access.manage ? "Monte a pauta, publique a convocação e os proprietários votam pelo Condtrack." : "Quando houver uma convocação, ela aparece aqui."}
          </Empty>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {list.map((a) => {
            const st = ASSEMBLY_STATUS[a.status as AssemblyStatus] ?? ASSEMBLY_STATUS.draft;
            const voted = a.votes.length;
            return (
              <Link key={a.id} href={`/assembleias/${a.id}`} className="group">
                <Card className="h-full p-5 transition group-hover:border-line-strong">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <Badge tone={st.tone} dot>{st.label}</Badge>
                    <span className="text-xs text-muted">{ASSEMBLY_KINDS[a.kind as AssemblyKind]}</span>
                  </div>
                  <h2 className="font-display text-lg font-semibold group-hover:text-brand">{a.title}</h2>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted"><CalendarDays className="size-3.5" />{fmtMeeting(a.meetingAt)}</p>
                  <p className="mt-3 text-xs text-fg-2">
                    {a._count.items} {a._count.items === 1 ? "item" : "itens"} na pauta
                    {a.status !== "draft" && ` · ${voted} de ${total} unidades votaram (${pct(voted, total)}%)`}
                    {a.status === "open" && ` · até ${fmtDateTimeBR(a.votingEndsAt)}`}
                  </p>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
