import type { Metadata } from "next";
import Link from "next/link";
import { DoorOpen, Search } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PERSON_KINDS, brt, brtParts, type PersonKind } from "@/lib/booking";
import { condoUnits, gateCondo, toPersonData } from "@/lib/booking-server";
import { fmtDateTime } from "@/lib/format";
import { unitLabel } from "@/lib/units";
import { Card, CardHeader, Empty, Input, PageHeader, Select, Stat, buttonClass, cx } from "@/components/ui";
import { AddPerson, PersonRow, QuickEntryForm } from "@/components/portaria/people";
import { BookingRow, bookingRowInclude } from "../reservas/booking-row";

export const metadata: Metadata = { title: "Portaria" };

const ENTRY_KIND: Record<string, string> = { visitor: "Visitante", provider: "Prestador", resident: "Morador", guest: "Convidado" };
const UNIT_ROLE: Record<string, string> = { owner: "proprietário", tenant: "inquilino", dependent: "dependente" };

export default async function GatePage({ searchParams }: PageProps<"/portaria">) {
  const user = await requireUser("superadmin", "syndic", "caretaker", "doorman");
  const sp = await searchParams;
  const condoId = await gateCondo(user);
  if (!condoId) {
    return (
      <div className="mx-auto max-w-5xl animate-in">
        <PageHeader eyebrow="Portaria" title="Portaria" />
        <Card><Empty icon={<DoorOpen />} title="Escolha um condomínio">Use o cartão do condomínio no menu.</Empty></Card>
      </div>
    );
  }
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";
  const unitFilter = typeof sp.unidade === "string" ? sp.unidade : "";
  const kindFilter = typeof sp.tipo === "string" && sp.tipo in PERSON_KINDS ? (sp.tipo as PersonKind) : null;
  const tab = sp.aba === "pessoas" ? "pessoas" : "hoje";
  const today = brtParts(new Date()).day;
  const dayStart = brt(today, "00:00");
  const dayEnd = new Date(dayStart.getTime() + 86400_000);
  const units = await condoUnits(condoId);
  const label = (id: string | null) => units.find((u) => u.id === id)?.label ?? "Condomínio";
  const ci = { contains: q, mode: "insensitive" as const };

  const personWhere: Prisma.UnitPersonWhereInput = {
    condominiumId: condoId,
    ...(q && { OR: [{ name: ci }, { document: ci }, { company: ci }] }),
    ...(unitFilter && { unitId: unitFilter }),
    ...(kindFilter && { kind: kindFilter }),
  };
  const showPeople = tab === "pessoas" || !!q;
  const [pendingCount, todayBookings, entries, people, accounts, guests] = await Promise.all([
    db.booking.count({ where: { condominiumId: condoId, status: "pending", endAt: { gt: new Date() } } }),
    db.booking.findMany({ where: { condominiumId: condoId, status: "approved", startAt: { lt: dayEnd }, endAt: { gt: dayStart } }, include: { ...bookingRowInclude, guests: { select: { checkedInAt: true } } }, orderBy: { startAt: "asc" } }),
    db.accessEntry.findMany({ where: { condominiumId: condoId, createdAt: { gte: dayStart } }, orderBy: { createdAt: "desc" }, take: 50 }),
    showPeople ? db.unitPerson.findMany({ where: personWhere, orderBy: { name: "asc" }, take: 200 }) : [],
    // Moradores com conta no app
    showPeople && (!kindFilter || kindFilter === "resident")
      ? db.userUnit.findMany({
          where: { unit: { building: { condominiumId: condoId } }, user: { status: "active", ...(q && { name: ci }) }, ...(unitFilter && { unitId: unitFilter }) },
          include: { user: { select: { name: true, phone: true } }, unit: { include: { building: true } } },
          take: 200,
        })
      : [],
    // Convidados das reservas de hoje (busca)
    q ? db.bookingGuest.findMany({ where: { name: ci, booking: { condominiumId: condoId, status: "approved", startAt: { lt: dayEnd }, endAt: { gt: dayStart } } }, include: { booking: { include: { commonArea: { select: { name: true } } } } }, take: 50 }) : [],
  ]);
  const gateKinds: PersonKind[] = user.role === "syndic" || user.role === "superadmin" ? ["visitor", "provider", "resident"] : ["visitor", "provider"];
  const tabHref = (t: string) => `/portaria${t === "pessoas" ? "?aba=pessoas" : ""}`;

  return (
    <div className="mx-auto max-w-5xl animate-in">
      <PageHeader eyebrow="Portaria" title="Portaria" description="Entradas, visitantes, prestadores e convidados das reservas." />

      <div className="mb-6 grid grid-cols-3 gap-4">
        <Link href="/reservas"><Stat label="Reservas para aprovar" value={pendingCount} tone={pendingCount ? "warn" : undefined} /></Link>
        <Stat label="Reservas hoje" value={todayBookings.length} />
        <Stat label="Entradas hoje" value={entries.length} />
      </div>

      <form className="mb-6 flex gap-2" action="/portaria">
        {tab === "pessoas" && <input type="hidden" name="aba" value="pessoas" />}
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input name="q" defaultValue={q} placeholder="Buscar por nome, documento ou empresa…" className="pl-9" />
        </div>
        <button className={buttonClass("outline")}>Buscar</button>
      </form>

      <nav className="mb-6 flex gap-1 border-b border-line">
        {([["hoje", "Hoje"], ["pessoas", "Pessoas autorizadas"]] as const).map(([k, l]) => (
          <Link key={k} href={tabHref(k)} className={cx("-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition", tab === k ? "border-brand text-brand" : "border-transparent text-muted hover:text-fg")}>{l}</Link>
        ))}
      </nav>

      {q && (
        <Card className="mb-6">
          <CardHeader title={`Resultado para “${q}”`} />
          {guests.length > 0 && (
            <ul className="divide-y divide-line border-b border-line">
              {guests.map((g) => (
                <li key={g.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                  <div className="min-w-0 flex-1"><p className="font-medium">{g.name}</p><p className="text-xs text-muted">Convidado · {g.booking.commonArea.name}{g.checkedInAt && ` · chegou ${fmtDateTime(g.checkedInAt)}`}</p></div>
                  <Link href={`/reservas/${g.bookingId}`} className={buttonClass("outline", "sm")}>Abrir reserva</Link>
                </li>
              ))}
            </ul>
          )}
          <PeopleList people={people} accounts={accounts} units={units} label={label} kinds={gateKinds} />
        </Card>
      )}

      {tab === "hoje" ? (
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <Card>
              <CardHeader title="Registrar entrada" subtitle="Quem já está cadastrado entra pela busca, com um clique." />
              <div className="p-5"><QuickEntryForm units={units} /></div>
            </Card>
            <Card>
              <CardHeader title="Reservas de hoje" subtitle="Abra para conferir a lista e marcar quem chegou." />
              {todayBookings.length ? (
                <div className="divide-y divide-line">
                  {todayBookings.map((b) => (
                    <div key={b.id}>
                      <BookingRow b={b} />
                      <p className="-mt-2 px-5 pb-3 text-xs text-muted">{b.guests.filter((g) => g.checkedInAt).length} de {b.guests.length} convidados chegaram</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="px-5 py-6 text-sm text-muted">Nenhuma reserva hoje.</p>
              )}
            </Card>
          </div>
          <Card>
            <CardHeader title="Entradas de hoje" />
            {entries.length ? (
              <ul className="divide-y divide-line">
                {entries.map((e) => (
                  <li key={e.id} className="px-5 py-2.5 text-sm">
                    <div className="flex items-baseline gap-2">
                      <span className="font-medium">{e.name}</span>
                      <span className="ml-auto shrink-0 text-xs text-muted">{brtParts(e.createdAt).hm}</span>
                    </div>
                    <p className="text-xs text-muted">{ENTRY_KIND[e.kind] ?? e.kind} · {label(e.unitId)}{e.document && ` · ${e.document}`} · por {e.createdBy}</p>
                    {e.notes && <p className="text-xs text-fg-2">{e.notes}</p>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-6 text-sm text-muted">Nenhuma entrada registrada hoje.</p>
            )}
          </Card>
        </div>
      ) : (
        <Card>
          <div className="flex flex-wrap items-end gap-3 border-b border-line p-5">
            <form className="flex flex-1 flex-wrap gap-2" action="/portaria">
              <input type="hidden" name="aba" value="pessoas" />
              {q && <input type="hidden" name="q" value={q} />}
              <Select name="unidade" defaultValue={unitFilter} className="w-auto">
                <option value="">Todas as unidades</option>
                {units.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
              </Select>
              <Select name="tipo" defaultValue={kindFilter ?? ""} className="w-auto">
                <option value="">Todos os tipos</option>
                {(Object.keys(PERSON_KINDS) as PersonKind[]).map((k) => <option key={k} value={k}>{PERSON_KINDS[k].plural}</option>)}
              </Select>
              <button className={buttonClass("outline")}>Filtrar</button>
            </form>
            <AddPerson units={units} kinds={gateKinds} label="Cadastrar visitante ou prestador" />
          </div>
          {!q && <PeopleList people={people} accounts={accounts} units={units} label={label} kinds={gateKinds} />}
          {q && <p className="px-5 py-4 text-sm text-muted">Resultado da busca acima.</p>}
        </Card>
      )}
    </div>
  );
}

type PersonRowData = Parameters<typeof toPersonData>[0];
type Account = { unitId: string; role: string; user: { name: string; phone: string | null }; unit: Parameters<typeof unitLabel>[0] };

function PeopleList({ people, accounts, units, label, kinds }: { people: PersonRowData[]; accounts: Account[]; units: { id: string; label: string }[]; label: (id: string | null) => string; kinds: PersonKind[] }) {
  if (!people.length && !accounts.length) return <p className="px-5 py-6 text-sm text-muted">Ninguém encontrado.</p>;
  return (
    <ul className="divide-y divide-line">
      {accounts.map((a) => (
        <li key={`${a.unitId}-${a.user.name}`} className="flex items-center gap-3 px-5 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{a.user.name} <span className="font-normal text-muted">· {unitLabel(a.unit)}</span></p>
            <p className="text-xs text-muted">Morador ({UNIT_ROLE[a.role] ?? a.role}) com conta no app{a.user.phone && ` · ${a.user.phone}`}</p>
          </div>
        </li>
      ))}
      {people.map((p) => (
        <PersonRow key={p.id} p={toPersonData(p, `${PERSON_KINDS[p.kind as PersonKind]?.label ?? p.kind} · ${label(p.unitId)}`)} units={units} kinds={kinds} canEdit={kinds.includes(p.kind as PersonKind)} gate />
      ))}
    </ul>
  );
}
