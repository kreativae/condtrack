import Link from "next/link";
import { Package, Phone, User, X } from "lucide-react";
import { db } from "@/lib/db";
import { GRANT_STATUS, brtParts, grantSchedule, grantStatus } from "@/lib/booking";
import { fmtDateTime } from "@/lib/format";
import { parcelOverdue, waitLabel } from "@/lib/parcels";
import { unitLabel } from "@/lib/units";
import { Badge, Card } from "@/components/ui";
import { QuickEntryButton } from "@/components/portaria/people";
import { ParcelRow } from "@/components/portaria/parcels";
import { DeliverAll } from "@/components/portaria/quick";

const KIND: Record<string, string> = { visitor: "Visitante", provider: "Prestador", delivery: "Entrega", resident: "Morador", guest: "Convidado" };
const UNIT_ROLE: Record<string, string> = { owner: "proprietário", tenant: "inquilino", dependent: "dependente" };

/** Tudo de uma unidade num lugar só: moradores, encomendas, autorizados e últimas entradas (as ações ficam nos atalhos do topo). */
export async function UnitPanel({ condoId, unitId, locations }: { condoId: string; unitId: string; locations: string[] }) {
  const unit = await db.unit.findFirst({ where: { id: unitId, building: { condominiumId: condoId } }, include: { building: true } });
  if (!unit) return null;
  const now = new Date();
  const [accounts, grants, parcels, entries] = await Promise.all([
    db.userUnit.findMany({ where: { unitId, user: { status: "active" } }, include: { user: { select: { name: true, phone: true } } } }),
    db.accessGrant.findMany({ where: { unitId }, include: { person: { select: { id: true, name: true, phone: true, company: true, blockedAt: true } } }, orderBy: { person: { name: "asc" } } }),
    db.parcel.findMany({ where: { unitId, status: "waiting" }, orderBy: { receivedAt: "asc" } }),
    db.accessEntry.findMany({ where: { dests: { some: { unitId } } }, orderBy: { createdAt: "desc" }, take: 5 }),
  ]);
  const residentGrants = grants.filter((g) => g.kind === "resident");
  const others = grants.filter((g) => g.kind !== "resident");
  const what = (p: { carrier: string | null; description: string | null }) => [p.carrier, p.description].filter(Boolean).join(" · ") || "Encomenda";
  const firstResident = accounts[0]?.user.name ?? residentGrants[0]?.person.name;

  return (
    <Card className="mb-6 overflow-visible">
      <div className="flex items-start gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0 flex-1">
          <p className="font-display text-2xl font-bold">{unitLabel(unit, true)}</p>
          <p className="text-sm text-muted">{accounts.length + residentGrants.length} morador(es) · {others.length} autorizado(s){parcels.length ? ` · ${parcels.length} encomenda(s) aguardando` : ""}</p>
        </div>
        {parcels.length > 0 && <Badge tone="warn" className="text-sm"><Package className="size-3.5" />{parcels.length}</Badge>}
        <Link href="/portaria" className="rounded-lg p-1.5 text-muted hover:bg-bg-2" aria-label="Fechar a unidade"><X className="size-5" /></Link>
      </div>

      <div className="@container border-t border-line"><div className="grid gap-px bg-line @3xl:grid-cols-2">
        <section className="bg-surface p-5">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Moradores</h3>
          <ul className="space-y-2">
            {accounts.map((a, i) => (
              <li key={`a${i}`} className="flex items-center gap-2 text-sm">
                <User className="size-4 shrink-0 text-muted" />
                <span className="min-w-0 flex-1 truncate font-medium">{a.user.name} <span className="font-normal text-muted">· {UNIT_ROLE[a.role] ?? a.role}</span></span>
                {a.user.phone && <a href={`tel:${a.user.phone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1 text-xs text-brand hover:underline"><Phone className="size-3" />{a.user.phone}</a>}
              </li>
            ))}
            {residentGrants.map((g) => (
              <li key={g.id} className="flex items-center gap-2 text-sm">
                <User className="size-4 shrink-0 text-muted" />
                <Link href={`/portaria/pessoa/${g.person.id}`} className="min-w-0 flex-1 truncate hover:text-brand">{g.person.name}{g.notes && <span className="text-muted"> · {g.notes}</span>}</Link>
                {g.person.phone && <a href={`tel:${g.person.phone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1 text-xs text-brand hover:underline"><Phone className="size-3" />{g.person.phone}</a>}
              </li>
            ))}
            {!accounts.length && !residentGrants.length && <li className="text-sm text-muted">Nenhum morador cadastrado.</li>}
          </ul>

          <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-muted">Autorizados</h3>
          {others.length ? (
            <ul className="divide-y divide-line">
              {others.map((g) => {
                const st = GRANT_STATUS[grantStatus(g, now)];
                return (
                  <li key={g.id} className="flex items-center gap-2 py-2 text-sm">
                    <Link href={`/portaria/pessoa/${g.person.id}`} className="min-w-0 flex-1 hover:text-brand">
                      <span className="block truncate font-medium">{g.person.name}{g.person.company && <span className="font-normal text-muted"> · {g.person.company}</span>}</span>
                      <span className="block truncate text-xs text-muted">{KIND[g.kind]} · {grantSchedule(g)}</span>
                    </Link>
                    {g.person.blockedAt ? <Badge tone="bad">Impedida</Badge> : <Badge tone={st.tone}>{st.label}</Badge>}
                    {!g.person.blockedAt && <QuickEntryButton personId={g.person.id} unitIds={[unitId]} name={g.person.name} />}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted">Ninguém autorizado.</p>
          )}
        </section>

        {/* No celular as encomendas vêm primeiro (o mais usado); no computador ficam na coluna da direita */}
        <section className="order-first bg-surface p-5 @3xl:order-none">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Encomendas aguardando</h3>
          {parcels.length ? (
            <>
              <ul className="-mx-5 divide-y divide-line">
                {parcels.map((p) => (
                  <ParcelRow
                    key={p.id}
                    locations={locations}
                    p={{
                      id: p.id, unit: what(p), recipient: p.recipient, what: "", volumes: p.volumes, location: p.location, photo: p.photoUrl,
                      wait: waitLabel(p.receivedAt, now), overdue: parcelOverdue(p.receivedAt, now), receivedBy: p.receivedByName, receivedAt: fmtDateTime(p.receivedAt),
                    }}
                  />
                ))}
              </ul>
              {parcels.length > 1 && <div className="mt-3"><DeliverAll unitId={unitId} count={parcels.length} suggestion={firstResident} /></div>}
            </>
          ) : (
            <p className="text-sm text-muted">Nada aguardando.</p>
          )}

          <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-muted">Últimas entradas</h3>
          {entries.length ? (
            <ul className="space-y-1.5 text-sm">
              {entries.map((e) => (
                <li key={e.id} className="flex gap-2">
                  <span className="w-28 shrink-0 whitespace-nowrap text-xs text-muted">{fmtDateTime(e.createdAt)}</span>
                  <span className="min-w-0 flex-1 truncate">{e.name} <span className="text-xs text-muted">· {KIND[e.kind] ?? e.kind}{e.exitedAt ? ` · saiu ${brtParts(e.exitedAt).hm}` : " · no condomínio"}</span></span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Nenhuma entrada registrada.</p>
          )}
        </section>
      </div></div>
    </Card>
  );
}
