import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, DoorOpen } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { GRANT_STATUS, PERSON_KINDS, brt, brtParts, docKey, expectedToday, grantSchedule, grantStatus, type PersonKind } from "@/lib/booking";
import { gateCondo } from "@/lib/booking-server";
import { byUnit, unitLabel } from "@/lib/units";
import { Badge, Card, CardHeader, Empty, PageHeader, Select, Stat, buttonClass, cx, type Tone } from "@/components/ui";
import { ExitButton, GateQuickActions, QuickEntryButton } from "@/components/portaria/people";
import { ArrivalButton } from "../reservas/booking-ui";
import { ContactAgenda } from "./agenda";
import { ParcelsTab } from "./parcels-tab";
import { UnitPanel } from "./unit-panel";
import { BatchReceive, GuestAccordion, QuickBar, UnitFilter } from "@/components/portaria/quick";
import { locationSuggestions } from "@/lib/parcels";

export const metadata: Metadata = { title: "Portaria" };

const KIND: Record<string, { label: string; tone: Tone }> = {
  visitor: { label: "Visitante", tone: "brand" },
  provider: { label: "Prestador", tone: "warn" },
  delivery: { label: "Entrega", tone: "info" },
  guest: { label: "Convidado", tone: "ok" },
  resident: { label: "Morador", tone: "info" },
};
const UNIT_ROLE: Record<string, string> = { owner: "proprietário", tenant: "inquilino", dependent: "dependente" };

export default async function GatePage({ searchParams }: PageProps<"/portaria">) {
  const user = await requireUser("superadmin", "syndic", "caretaker", "doorman");
  const sp = await searchParams;
  const condoId = await gateCondo(user);
  if (!condoId) {
    return (
      <div className="mx-auto max-w-6xl animate-in">
        <PageHeader eyebrow="Portaria" title="Portaria" />
        <Card><Empty icon={<DoorOpen />} title="Escolha um condomínio">Use o cartão do condomínio no menu.</Empty></Card>
      </div>
    );
  }
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";
  const selectedUnit = typeof sp.u === "string" ? sp.u : "";
  const unitFilter = typeof sp.unidade === "string" ? sp.unidade : "";
  const kindFilter = typeof sp.tipo === "string" && sp.tipo in PERSON_KINDS ? (sp.tipo as PersonKind) : null;
  const tab = sp.aba === "pessoas" ? "pessoas" : sp.aba === "agenda" ? "agenda" : sp.aba === "encomendas" ? "encomendas" : "hoje";
  const now = new Date();
  const today = brtParts(now).day;
  const dayStart = brt(today, "00:00");
  const dayEnd = new Date(dayStart.getTime() + 86400_000);
  const ci = { contains: q, mode: "insensitive" as const };

  const unitRows = await db.unit.findMany({ where: { building: { condominiumId: condoId } }, include: { building: true } });
  const sorted = unitRows.sort(byUnit);
  // number e building alimentam a busca digitando ("502", "aurora 502")
  const units = sorted.map((u) => ({ id: u.id, label: unitLabel(u, true), number: u.number, building: u.building.name }));
  const label = (id: string | null) => units.find((u) => u.id === id)?.label ?? "Condomínio";
  const destLabel = (e: { dests: { unitId: string }[]; notes: string | null }) =>
    e.notes?.startsWith("Convidado: ") ? e.notes.slice(11) : e.dests.length ? e.dests.map((d) => label(d.unitId)).join(" + ") : "Condomínio";
  const unitMatches = q ? units.filter((u) => u.label.toLowerCase().replace(/[·\s]+/g, " ").includes(q.toLowerCase())).map((u) => u.id) : [];

  const [usedLocations, residentAccounts, residentPeople] = await Promise.all([
    db.parcel.findMany({ where: { condominiumId: condoId, location: { not: null } }, select: { location: true }, orderBy: { receivedAt: "desc" }, take: 500 }),
    db.userUnit.findMany({ where: { unit: { building: { condominiumId: condoId } }, user: { status: "active" } }, select: { unitId: true, user: { select: { name: true } } } }),
    db.accessGrant.findMany({ where: { condominiumId: condoId, kind: "resident", unitId: { not: null } }, select: { unitId: true, person: { select: { name: true } } } }),
  ]);
  const locations = locationSuggestions(usedLocations.map((p) => p.location));
  const labelResidents = [...residentAccounts.map((a) => ({ name: a.user.name, unitId: a.unitId })), ...residentPeople.map((g) => ({ name: g.person.name, unitId: g.unitId! }))];

  const [pendingCount, todayBookings, grants, inside, todayEntries, parcelsWaiting] = await Promise.all([
    db.booking.count({ where: { condominiumId: condoId, status: "pending", endAt: { gt: now } } }),
    db.booking.findMany({
      where: { condominiumId: condoId, status: "approved", startAt: { lt: dayEnd }, endAt: { gt: dayStart } },
      include: { commonArea: { select: { name: true } }, unit: { include: { building: true } }, guests: { orderBy: { name: "asc" } } },
      orderBy: { startAt: "asc" },
    }),
    // Autorizações de quem vem de fora (para "Esperados hoje")
    db.accessGrant.findMany({ where: { condominiumId: condoId, kind: { not: "resident" } }, include: { person: { select: { id: true, name: true, company: true, blockedAt: true } } } }),
    db.accessEntry.findMany({ where: { condominiumId: condoId, exitedAt: null, kind: { not: "resident" }, createdAt: { gte: new Date(now.getTime() - 86400_000) } }, include: { dests: true }, orderBy: { createdAt: "desc" } }),
    db.accessEntry.findMany({ where: { condominiumId: condoId, OR: [{ createdAt: { gte: dayStart } }, { exitedAt: { gte: dayStart } }] }, include: { dests: true }, orderBy: { createdAt: "desc" }, take: 150 }),
    db.parcel.count({ where: { condominiumId: condoId, status: "waiting" } }),
  ]);

  // Esperados: agrupa as autorizações de hoje por pessoa (destinos juntos); some quem já entrou hoje
  const enteredToday = new Set(todayEntries.filter((e) => e.createdAt >= dayStart && e.personId).map((e) => e.personId));
  const expectedMap = new Map<string, { person: (typeof grants)[number]["person"]; kind: string; schedule: string; unitIds: string[] }>();
  for (const g of grants) {
    if (g.person.blockedAt || enteredToday.has(g.personId) || !expectedToday(g, now)) continue;
    const cur = expectedMap.get(g.personId) ?? { person: g.person, kind: g.kind, schedule: grantSchedule(g), unitIds: [] };
    if (g.unitId) cur.unitIds.push(g.unitId);
    expectedMap.set(g.personId, cur);
  }
  const expected = [...expectedMap.values()].sort((a, b) => a.person.name.localeCompare(b.person.name));
  const waitingGuests = todayBookings.reduce((n, b) => n + b.guests.filter((g) => !g.checkedInAt).length, 0);
  const entriesToday = todayEntries.filter((e) => e.createdAt >= dayStart).length;
  const timeline = todayEntries
    .flatMap((e) => [
      ...(e.createdAt >= dayStart ? [{ at: e.createdAt, out: false, e }] : []),
      ...(e.exitedAt && e.exitedAt >= dayStart ? [{ at: e.exitedAt, out: true, e }] : []),
    ])
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 40);

  const gateKinds: PersonKind[] = user.role === "syndic" || user.role === "superadmin" ? ["visitor", "provider", "delivery", "resident"] : ["visitor", "provider", "delivery"];

  // Aba Pessoas (filtros por unidade e tipo)
  const showPeople = tab === "pessoas";
  const grantWhere: Prisma.AccessGrantWhereInput = {
    condominiumId: condoId,
    ...(unitFilter && { unitId: unitFilter === "condominio" ? null : unitFilter }),
    ...(kindFilter && { kind: kindFilter }),
  };
  const [peopleGrants, accounts] = showPeople
    ? await Promise.all([
        db.accessGrant.findMany({ where: grantWhere, include: { person: { select: { id: true, name: true, document: true, company: true, blockedAt: true } } }, orderBy: { person: { name: "asc" } }, take: 400 }),
        (!kindFilter || kindFilter === "resident") && unitFilter !== "condominio"
          ? db.userUnit.findMany({
              where: { unit: { building: { condominiumId: condoId } }, user: { status: "active" }, ...(unitFilter && { unitId: unitFilter }) },
              include: { user: { select: { name: true, phone: true } } },
              take: 400,
            })
          : [],
      ])
    : [[], []];

  // Busca: só nomes (uma linha por pessoa); o histórico fica na ficha
  const key = docKey(q);
  const personSearch: Prisma.AccessPersonWhereInput = {
    condominiumId: condoId,
    OR: [{ name: ci }, { document: ci }, { company: ci }, ...(key && key.length >= 3 ? [{ docKey: { contains: key } }] : []), ...(unitMatches.length ? [{ grants: { some: { unitId: { in: unitMatches } } } }] : [])],
  };
  const [found, foundTotal, foundResidents, guests] = q
    ? await Promise.all([
        db.accessPerson.findMany({ where: personSearch, include: { grants: { select: { unitId: true, kind: true } } }, orderBy: { name: "asc" }, take: 30 }),
        db.accessPerson.count({ where: personSearch }),
        db.userUnit.findMany({
          where: { unit: { building: { condominiumId: condoId } }, user: { status: "active" }, OR: [{ user: { name: ci } }, ...(unitMatches.length ? [{ unitId: { in: unitMatches } }] : [])] },
          include: { user: { select: { name: true, phone: true } } },
          take: 10,
        }),
        db.bookingGuest.findMany({ where: { OR: [{ name: ci }, { document: ci }], booking: { condominiumId: condoId, status: "approved", startAt: { lt: dayEnd }, endAt: { gt: dayStart } } }, include: { booking: { include: { commonArea: { select: { name: true } } } } }, take: 10 }),
      ])
    : [[], 0, [], []];

  // Agrupa por unidade (torre e número) e, no fim, o condomínio
  const groups = [
    ...sorted.map((u) => ({ id: u.id, label: unitLabel(u, true), accounts: accounts.filter((a) => a.unitId === u.id), grants: peopleGrants.filter((g) => g.unitId === u.id) })),
    { id: "condominio", label: "Condomínio (áreas comuns e administração)", accounts: [], grants: peopleGrants.filter((g) => !g.unitId) },
  ].filter((g) => g.accounts.length || g.grants.length);

  return (
    <div className="mx-auto max-w-6xl animate-in">
      {/* Tudo começa pela barra: unidade abre o cartão dela; nome busca pessoas. "/" volta para cá. */}
      <div className="mb-4 flex flex-wrap items-start gap-2">
        <div className="min-w-64 flex-1"><QuickBar units={units} initial={q} /></div>
        <GateQuickActions units={units} kinds={gateKinds} />
      </div>

      {selectedUnit ? (
        <UnitPanel condoId={condoId} unitId={selectedUnit} units={units} locations={locations} labelUnits={units} residents={labelResidents} kinds={gateKinds} />
      ) : (
        !q && (
          <Card className="mb-6">
            <CardHeader title="Recebimento em lote" subtitle="Chegou a van com vários pacotes: fixe transportadora e local, digite a unidade e Enter." />
            <div className="p-5"><BatchReceive units={units} locations={locations} /></div>
          </Card>
        )
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Esperados hoje" value={waitingGuests + expected.length} />
        <Stat label="No condomínio agora" value={inside.length} tone={inside.length ? "brand" : undefined} />
        <Stat label="Entradas hoje" value={entriesToday} />
        <Link href="/portaria?aba=encomendas"><Stat label="Encomendas aguardando" value={parcelsWaiting} tone={parcelsWaiting ? "brand" : undefined} /></Link>
        <Link href="/reservas"><Stat label="Reservas para aprovar" value={pendingCount} tone={pendingCount ? "warn" : undefined} /></Link>
      </div>

      {q && (
        <Card className="mb-6">
          <CardHeader
            title={`Resultado para “${q}”`}
            subtitle={foundTotal > found.length ? `Mostrando ${found.length} de ${foundTotal}. Refine com sobrenome, documento ou unidade.` : undefined}
            action={<Link href={tab === "hoje" ? "/portaria" : `/portaria?aba=${tab}`} className="text-xs font-medium text-brand hover:underline">Limpar</Link>}
          />
          <ul className="divide-y divide-line">
            {guests.map((g) => (
              <li key={g.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                <div className="min-w-0 flex-1"><p className="font-medium">{g.name}</p><p className="text-xs text-muted">Convidado hoje · {g.booking.commonArea.name}</p></div>
                <ArrivalButton guestId={g.id} arrived={!!g.checkedInAt} />
              </li>
            ))}
            {found.map((p) => {
              const kinds = [...new Set(p.grants.map((g) => KIND[g.kind]?.label ?? g.kind))].join(", ");
              const places = [...new Set(p.grants.map((g) => label(g.unitId)))];
              return (
                <li key={p.id}>
                  <Link href={`/portaria/pessoa/${p.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-bg-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{p.name}{p.company && <span className="font-normal text-muted"> · {p.company}</span>}</p>
                      <p className="truncate text-xs text-muted">{places.length ? `${kinds} · ${places.slice(0, 3).join(" + ")}${places.length > 3 ? ` +${places.length - 3}` : ""}` : "Sem autorização"}</p>
                    </div>
                    {p.blockedAt && <Badge tone="bad">Impedida</Badge>}
                    <ChevronRight className="size-4 shrink-0 text-muted" />
                  </Link>
                </li>
              );
            })}
            {foundResidents.map((a, i) => (
              <li key={`r${i}`} className="flex items-center gap-3 px-5 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{a.user.name}</p>
                  <p className="truncate text-xs text-muted">Morador ({UNIT_ROLE[a.role] ?? a.role}) · {label(a.unitId)}{a.user.phone && ` · ${a.user.phone}`}</p>
                </div>
                <Badge tone="info">Morador</Badge>
              </li>
            ))}
          </ul>
          {!found.length && !foundResidents.length && !guests.length && <p className="px-5 py-6 text-sm text-muted">Ninguém encontrado. Para alguém sem cadastro, use “Registrar entrada”.</p>}
        </Card>
      )}

      <nav className="mb-5 flex gap-1 border-b border-line">
        {([["hoje", "Hoje"], ["encomendas", "Encomendas"], ["agenda", "Agenda"], ["pessoas", "Pessoas por unidade"]] as const).map(([k, l]) => (
          <Link key={k} href={k === "hoje" ? "/portaria" : `/portaria?aba=${k}`} className={cx("-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition", tab === k ? "border-brand text-brand" : "border-transparent text-muted hover:text-fg")}>{l}</Link>
        ))}
      </nav>

      {tab === "encomendas" ? (
        <ParcelsTab condoId={condoId} sp={sp} units={units} />
      ) : tab === "agenda" ? (
        <Card>
          <ContactAgenda
            condoId={condoId}
            sp={sp}
            buildings={[...new Map(sorted.map((u) => [u.building.id, { id: u.building.id, name: u.building.name }])).values()]}
            units={units}
          />
        </Card>
      ) : tab === "hoje" ? (
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Esperados hoje" subtitle="Convidados das reservas e quem tem autorização para hoje." />
            {todayBookings.map((b) => {
              const waiting = b.guests.filter((g) => !g.checkedInAt);
              // Aberta só perto do horário: de 1 h antes do início até o fim da reserva
              const soon = b.startAt.getTime() - 3600_000 <= now.getTime() && now.getTime() < b.endAt.getTime();
              return (
                <GuestAccordion
                  key={b.id}
                  id={b.id}
                  defaultOpen={soon}
                  header={
                    <span className="flex flex-wrap items-baseline gap-x-2 text-sm">
                      <span className="font-semibold">{b.commonArea.name}</span>
                      <span className="text-xs text-muted">{brtParts(b.startAt).hm}–{brtParts(b.endAt).hm} · {b.unit ? unitLabel(b.unit, true) : "Condomínio"}</span>
                      <span className="ml-auto shrink-0 text-xs text-muted">{b.guests.length - waiting.length} de {b.guests.length} chegaram</span>
                    </span>
                  }
                >
                  {waiting.length > 0 ? (
                    <ul className="divide-y divide-line">
                      {waiting.slice(0, 12).map((g) => (
                        <li key={g.id} className="flex items-center gap-2 py-1.5 text-sm">
                          <span className="min-w-0 flex-1 truncate">{g.name}{g.document && <span className="text-xs text-muted"> · {g.document}</span>}</span>
                          <Badge tone="ok">Convidado</Badge>
                          <ArrivalButton guestId={g.id} arrived={false} />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted">Todos os convidados já chegaram.</p>
                  )}
                  <Link href={`/reservas/${b.id}`} className="mt-1 block text-xs font-medium text-brand hover:underline">
                    {waiting.length > 12 ? `Ver os outros ${waiting.length - 12} convidados` : "Abrir a reserva"}
                  </Link>
                </GuestAccordion>
              );
            })}
            {expected.length > 0 && (
              <>
                <p className="px-5 pt-3 text-xs font-medium text-muted">Autorizados para hoje</p>
                <ul className="divide-y divide-line">
                  {expected.map((x) => (
                    <li key={x.person.id} className="flex items-center gap-2 px-5 py-2 text-sm">
                      <Link href={`/portaria/pessoa/${x.person.id}`} className="min-w-0 flex-1 hover:text-brand">
                        <span className="block truncate font-medium">{x.person.name}{x.person.company && <span className="font-normal text-muted"> · {x.person.company}</span>}</span>
                        <span className="block truncate text-xs text-muted">{x.unitIds.length ? x.unitIds.map(label).join(" + ") : "Condomínio"} · {x.schedule}</span>
                      </Link>
                      <Badge tone={KIND[x.kind]?.tone ?? "muted"}>{KIND[x.kind]?.label ?? x.kind}</Badge>
                      <QuickEntryButton personId={x.person.id} unitIds={x.unitIds} name={x.person.name} />
                    </li>
                  ))}
                </ul>
              </>
            )}
            {!todayBookings.length && !expected.length && <p className="px-5 py-6 text-sm text-muted">Ninguém esperado hoje. Autorizações com dia marcado (diarista às terças, visita de hoje) aparecem aqui.</p>}
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader title={`No condomínio agora (${inside.length})`} subtitle="Quem entrou e ainda não saiu." />
              {inside.length ? (
                <ul className="divide-y divide-line">
                  {inside.map((e) => (
                    <li key={e.id} className="flex items-center gap-2 px-5 py-2 text-sm">
                      <span className="min-w-0 flex-1 truncate">
                        {e.personId ? <Link href={`/portaria/pessoa/${e.personId}`} className="hover:text-brand">{e.name}</Link> : e.name}
                        <span className="text-xs text-muted"> · {destLabel(e)} · desde {brtParts(e.createdAt).hm}</span>
                      </span>
                      <Badge tone={KIND[e.kind]?.tone ?? "muted"}>{KIND[e.kind]?.label ?? e.kind}</Badge>
                      <ExitButton entryId={e.id} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-5 py-6 text-sm text-muted">Ninguém de fora no momento.</p>
              )}
            </Card>
            <Card>
              <CardHeader title="Linha do tempo de hoje" />
              {timeline.length ? (
                <ol className="px-5 py-3">
                  {timeline.map((t, i) => (
                    <li key={i} className="relative flex gap-3 pb-3 pl-4 text-sm before:absolute before:left-[3px] before:top-2 before:h-full before:w-px before:bg-line last:before:hidden">
                      <span className={cx("absolute left-0 top-1.5 size-[7px] rounded-full", t.out ? "bg-muted" : "bg-brand")} />
                      <span className="w-11 shrink-0 font-num text-xs text-muted">{brtParts(t.at).hm}</span>
                      <span className="min-w-0 flex-1">
                        {t.out ? "Saiu" : "Entrou"} <b className="font-medium">{t.e.name}</b>
                        <span className="text-xs text-muted"> · {KIND[t.e.kind]?.label ?? t.e.kind}, {destLabel(t.e)}{!t.out && ` · ${t.e.createdBy}`}</span>
                        {!t.out && t.e.notes && !t.e.notes.startsWith("Convidado: ") && <span className="block text-xs text-fg-2">{t.e.notes}</span>}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="px-5 py-6 text-sm text-muted">Nada registrado hoje.</p>
              )}
            </Card>
          </div>
        </div>
      ) : (
        <Card>
          <div className="flex flex-wrap gap-2 border-b border-line p-4">
            <UnitFilter units={units} value={unitFilter} base="/portaria" extra={{ aba: "pessoas", ...(kindFilter && { tipo: kindFilter }) }} condoOption />
            <form className="flex gap-2" action="/portaria">
              <input type="hidden" name="aba" value="pessoas" />
              {unitFilter && <input type="hidden" name="unidade" value={unitFilter} />}
              <Select name="tipo" defaultValue={kindFilter ?? ""} className="w-auto">
                <option value="">Todos os tipos</option>
                {(Object.keys(PERSON_KINDS) as PersonKind[]).map((k) => <option key={k} value={k}>{PERSON_KINDS[k].plural}</option>)}
              </Select>
              <button className={buttonClass("outline")}>Filtrar</button>
            </form>
          </div>
          <PeopleByUnit groups={groups} open={!!unitFilter || groups.length <= 3} />
        </Card>
      )}
    </div>
  );
}

type Group = {
  id: string; label: string;
  accounts: { unitId: string; role: string; user: { name: string; phone: string | null } }[];
  grants: { id: string; personId: string; kind: string; validFrom: Date | null; validUntil: Date | null; weekdays: string; timeFrom: string | null; timeTo: string | null; person: { id: string; name: string; company: string | null; blockedAt: Date | null } }[];
};

/** Pessoas agrupadas por unidade; cada linha abre a ficha (onde aparecem as outras unidades da pessoa). */
function PeopleByUnit({ groups, open }: { groups: Group[]; open?: boolean }) {
  if (!groups.length) return <p className="px-5 py-6 text-sm text-muted">Ninguém encontrado.</p>;
  return (
    <div className="divide-y divide-line">
      {groups.map((g) => {
        const count = (k: string) => g.grants.filter((x) => x.kind === k).length + (k === "resident" ? g.accounts.length : 0);
        const summary = (Object.keys(PERSON_KINDS) as PersonKind[]).map((k) => count(k) && `${count(k)} ${PERSON_KINDS[k].plural.toLowerCase().replace(" de serviço", "")}`).filter(Boolean).join(" · ");
        return (
          <details key={g.id} open={open}>
            <summary className="flex cursor-pointer items-center gap-3 px-5 py-3 text-sm hover:bg-bg-2">
              <span className="font-semibold">{g.label}</span>
              <span className="text-xs text-muted">{summary}</span>
            </summary>
            <ul className="divide-y divide-line border-t border-line bg-bg-2/30">
              {g.accounts.map((a, i) => (
                <li key={`a${i}`} className="flex items-center gap-3 px-5 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{a.user.name}</p>
                    <p className="text-xs text-muted">Morador ({UNIT_ROLE[a.role] ?? a.role}) com conta no app{a.user.phone && ` · ${a.user.phone}`}</p>
                  </div>
                  <Badge tone="info">Morador</Badge>
                </li>
              ))}
              {g.grants.map((x) => {
                const st = GRANT_STATUS[grantStatus(x)];
                return (
                  <li key={x.id}>
                    <Link href={`/portaria/pessoa/${x.person.id}`} className={cx("flex items-center gap-3 px-5 py-2.5 hover:bg-bg-2", st === GRANT_STATUS.expired && "opacity-60")}>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{x.person.name}{x.person.company && <span className="font-normal text-muted"> · {x.person.company}</span>}</p>
                        <p className="text-xs text-muted">{grantSchedule(x)}</p>
                      </div>
                      {x.person.blockedAt && <Badge tone="bad">Impedida</Badge>}
                      <Badge tone={KIND[x.kind]?.tone ?? "muted"}>{KIND[x.kind]?.label ?? x.kind}</Badge>
                      {x.kind !== "resident" && <Badge tone={st.tone}>{st.label}</Badge>}
                      <ChevronRight className="size-4 shrink-0 text-muted" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </details>
        );
      })}
    </div>
  );
}
