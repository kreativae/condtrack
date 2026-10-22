import Link from "next/link";
import { Package } from "lucide-react";
import { db } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";
import { PARCEL_STATUS, locationSuggestions, parcelOverdue, waitLabel, type ParcelStatus } from "@/lib/parcels";
import { Badge, Card, CardHeader, Empty, cx } from "@/components/ui";
import { ParcelRow, ReceiveParcelForm } from "@/components/portaria/parcels";
import { UnitFilter } from "@/components/portaria/quick";
import type { UnitOption } from "@/lib/unit-search";

type SP = Record<string, string | string[] | undefined>;
const str = (v: SP[string]) => (typeof v === "string" ? v : "");

/** Aba Encomendas da portaria: receber, ver o que está aguardando (e onde) e dar baixa. */
export async function ParcelsTab({ condoId, sp, units }: { condoId: string; sp: SP; units: UnitOption[] }) {
  const view = str(sp.ver) === "entregues" ? "entregues" : "aguardando";
  const unitFilter = str(sp.unidade);
  const label = (id: string) => units.find((u) => u.id === id)?.label ?? "—";
  const now = new Date();
  const [waiting, history, usedLocations, unitRows, accounts, people] = await Promise.all([
    db.parcel.findMany({ where: { condominiumId: condoId, status: "waiting", ...(unitFilter && { unitId: unitFilter }) }, orderBy: { receivedAt: "asc" } }),
    view === "entregues"
      ? db.parcel.findMany({ where: { condominiumId: condoId, status: { not: "waiting" }, ...(unitFilter && { unitId: unitFilter }) }, orderBy: { deliveredAt: "desc" }, take: 100 })
      : [],
    db.parcel.findMany({ where: { condominiumId: condoId, location: { not: null } }, select: { location: true }, orderBy: { receivedAt: "desc" }, take: 500 }),
    // Para ler a etiqueta: número e torre de cada unidade, e os nomes de quem mora em cada uma
    db.unit.findMany({ where: { building: { condominiumId: condoId } }, select: { id: true, number: true, building: { select: { name: true } } } }),
    db.userUnit.findMany({ where: { unit: { building: { condominiumId: condoId } }, user: { status: "active" } }, select: { unitId: true, user: { select: { name: true } } } }),
    db.accessGrant.findMany({ where: { condominiumId: condoId, kind: "resident", unitId: { not: null } }, select: { unitId: true, person: { select: { name: true } } } }),
  ]);
  const labelUnits = unitRows.map((u) => ({ id: u.id, number: u.number, building: u.building.name }));
  const residents = [...accounts.map((a) => ({ name: a.user.name, unitId: a.unitId })), ...people.map((g) => ({ name: g.person.name, unitId: g.unitId! }))];
  const locations = locationSuggestions(usedLocations.map((p) => p.location));
  const what = (p: { carrier: string | null; description: string | null }) => [p.carrier, p.description].filter(Boolean).join(" · ") || "Encomenda";
  const base = (v: string) => `/portaria?aba=encomendas${v === "entregues" ? "&ver=entregues" : ""}${unitFilter ? `&unidade=${unitFilter}` : ""}`;

  return (
    <div className="grid items-start gap-6 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
      <Card>
        <CardHeader title="Receber encomenda" subtitle="Quem mora na unidade recebe o aviso com o local onde ela ficou." />
        <div className="p-5"><ReceiveParcelForm units={units} locations={locations} labelUnits={labelUnits} residents={residents} /></div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-4">
          <div className="inline-flex rounded-xl bg-bg-2 p-1 text-sm">
            {([["aguardando", `Aguardando (${waiting.length})`], ["entregues", "Entregues"]] as const).map(([k, l]) => (
              <Link key={k} href={base(k)} className={cx("rounded-lg px-3 py-1.5 font-medium transition", view === k ? "bg-surface text-fg shadow-card" : "text-muted hover:text-fg")}>{l}</Link>
            ))}
          </div>
          <div className="ml-auto flex min-w-64 flex-1 justify-end">
            <UnitFilter units={units} value={unitFilter} base="/portaria" extra={{ aba: "encomendas", ...(view === "entregues" && { ver: "entregues" }) }} />
          </div>
        </div>

        {view === "aguardando" ? (
          waiting.length ? (
            <ul className="divide-y divide-line">
              {waiting.map((p) => (
                <ParcelRow
                  key={p.id}
                  locations={locations}
                  p={{
                    id: p.id, unit: label(p.unitId), recipient: p.recipient, what: what(p), volumes: p.volumes, location: p.location, photo: p.photoUrl,
                    wait: waitLabel(p.receivedAt, now), overdue: parcelOverdue(p.receivedAt, now), receivedBy: p.receivedByName, receivedAt: fmtDateTime(p.receivedAt),
                  }}
                />
              ))}
            </ul>
          ) : (
            <Empty icon={<Package />} title="Nenhuma encomenda aguardando">{unitFilter ? "Nada para esta unidade." : "O que for recebido aparece aqui até a retirada."}</Empty>
          )
        ) : history.length ? (
          <ul className="divide-y divide-line">
            {history.map((p) => {
              const st = PARCEL_STATUS[p.status as ParcelStatus] ?? PARCEL_STATUS.delivered;
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{label(p.unitId)}{p.recipient && <span className="font-normal text-fg-2"> · {p.recipient}</span>}</p>
                    <p className="text-xs text-muted">
                      {what(p)} · recebida {fmtDateTime(p.receivedAt)}
                      {p.status === "delivered" ? ` · retirada por ${p.deliveredTo} em ${fmtDateTime(p.deliveredAt)} (${p.deliveredByName})` : ` · ${p.notes ?? ""} (${p.deliveredByName})`}
                    </p>
                  </div>
                  <Badge tone={st.tone}>{st.label}</Badge>
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty icon={<Package />} title="Nada entregue ainda" />
        )}
      </Card>
    </div>
  );
}
