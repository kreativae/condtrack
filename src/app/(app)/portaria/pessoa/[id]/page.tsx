import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PERSON_KINDS, brtParts, grantStatus, type PersonKind } from "@/lib/booking";
import { gateCondo, toGrantData } from "@/lib/booking-server";
import { initials } from "@/lib/format";
import { byUnit, unitLabel } from "@/lib/units";
import { Alert, Badge, Card, CardHeader } from "@/components/ui";
import { AddGrant, GrantRow, PersonActions } from "@/components/portaria/people";

export const metadata: Metadata = { title: "Ficha da pessoa" };

const KIND_LABEL: Record<string, string> = { visitor: "Visitante", provider: "Prestador", delivery: "Entrega", resident: "Morador", guest: "Convidado" };

export default async function PersonPage({ params }: PageProps<"/portaria/pessoa/[id]">) {
  const user = await requireUser("superadmin", "syndic", "caretaker", "doorman");
  const { id } = await params;
  const condoId = await gateCondo(user);
  const p = condoId
    ? await db.accessPerson.findFirst({
        where: { id, condominiumId: condoId },
        include: {
          grants: { include: { unit: { include: { building: true } } }, orderBy: { createdAt: "asc" } },
          entries: { include: { dests: { include: { unit: { include: { building: true } } } } }, orderBy: { createdAt: "desc" }, take: 30 },
        },
      })
    : null;
  if (!p || !condoId) notFound();

  const unitRows = await db.unit.findMany({ where: { building: { condominiumId: condoId } }, include: { building: true } });
  const units = unitRows.sort(byUnit).map((u) => ({ id: u.id, label: unitLabel(u, true) }));
  const now = new Date();
  const kinds: PersonKind[] = user.role === "syndic" || user.role === "superadmin" ? ["visitor", "provider", "delivery", "resident"] : ["visitor", "provider", "delivery"];
  const basics = { id: p.id, name: p.name, document: p.document, phone: p.phone, company: p.company };
  const suggested = p.grants.map((g) => ({ unitId: g.unitId, label: g.unit ? unitLabel(g.unit, true) : "Condomínio", ok: grantStatus(g, now) === "today" }));
  const main = p.grants.find((g) => g.kind !== "resident") ?? p.grants[0];
  const dateLabel = (d: Date) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "2-digit", month: "2-digit" }).format(d);

  return (
    <div className="mx-auto max-w-6xl animate-in">
      <Link href="/portaria" className="mb-6 inline-flex items-center gap-2 text-xs font-medium text-muted hover:text-brand"><ArrowLeft className="size-3.5" />Portaria</Link>

      <Card className="mb-6 p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-4">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-brand-soft font-display text-lg font-semibold text-brand">{initials(p.name)}</span>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-2xl font-bold">{p.name}</h1>
            <p className="text-sm text-fg-2">
              {[p.company ?? (main ? PERSON_KINDS[main.kind as PersonKind]?.label : null), p.document && `Doc. ${p.document}`, p.phone].filter(Boolean).join(" · ") || "Sem documento cadastrado"}
            </p>
          </div>
          <Badge tone={p.blockedAt ? "bad" : "ok"} dot>{p.blockedAt ? "Impedida" : "Liberada"}</Badge>
        </div>
        {p.blockedAt && <div className="mb-4"><Alert>Entrada impedida desde {dateLabel(p.blockedAt)}: {p.blockedReason ?? "sem motivo informado"}.</Alert></div>}
        {p.notes && <p className="mb-4 whitespace-pre-line rounded-xl bg-bg-2 p-3 text-sm text-fg-2">{p.notes}</p>}
        <PersonActions person={basics} notes={p.notes} blocked={!!p.blockedAt} units={units} suggested={suggested} />
      </Card>

      <div className="grid items-start gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader title="Autorizações" subtitle="Para onde a pessoa pode ir, em que dias e até quando." />
          {p.grants.length ? (
            <ul className="divide-y divide-line">
              {p.grants.map((g) => (
                <GrantRow
                  key={g.id}
                  g={toGrantData(g, now)}
                  title={g.unit ? unitLabel(g.unit, true) : "Condomínio"}
                  person={basics}
                  units={units}
                  kinds={kinds}
                  canEdit={kinds.includes(g.kind as PersonKind)}
                  canEditPerson={false}
                />
              ))}
            </ul>
          ) : (
            <p className="px-5 py-6 text-sm text-muted">Sem autorizações. A entrada pode ser registrada mesmo assim; as unidades de destino são avisadas.</p>
          )}
          <div className="border-t border-line p-4"><AddGrant label="Nova autorização" personId={p.id} units={units} kinds={kinds} allowCondo /></div>
        </Card>

        <Card>
          <CardHeader title="Últimas entradas" />
          {p.entries.length ? (
            <ul className="divide-y divide-line">
              {p.entries.map((e) => (
                <li key={e.id} className="px-5 py-2.5 text-sm">
                  <div className="flex items-baseline gap-2">
                    <span className="w-24 shrink-0 text-xs text-muted">{dateLabel(e.createdAt)}</span>
                    <span className="min-w-0 flex-1">
                      {brtParts(e.createdAt).hm}{e.exitedAt ? `–${brtParts(e.exitedAt).hm}` : " · ainda no condomínio"}
                      <span className="text-muted"> · {e.dests.length ? e.dests.map((d) => unitLabel(d.unit, true)).join(" + ") : "Condomínio"}</span>
                    </span>
                  </div>
                  <p className="pl-26 text-xs text-muted">{KIND_LABEL[e.kind] ?? e.kind} · por {e.createdBy}{e.notes && ` · ${e.notes}`}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-6 text-sm text-muted">Nenhuma entrada registrada.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
