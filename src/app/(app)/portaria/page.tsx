import type { Metadata } from "next";
import Link from "next/link";
import { DoorOpen, Search } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PERSON_KINDS, brt, brtParts, type PersonKind } from "@/lib/booking";
import { gateCondo, toPersonData } from "@/lib/booking-server";
import { fmtDateTime } from "@/lib/format";
import { byUnit, unitLabel } from "@/lib/units";
import { Badge, Card, CardHeader, Empty, Input, PageHeader, Select, Stat, buttonClass, cx, type Tone } from "@/components/ui";
import { EntryButton, ExitButton, GateQuickActions, PersonRow } from "@/components/portaria/people";
import { ArrivalButton } from "../reservas/booking-ui";

export const metadata: Metadata = { title: "Portaria" };

const KIND: Record<string, { label: string; tone: Tone }> = {
  visitor: { label: "Visitante", tone: "brand" },
  provider: { label: "Prestador", tone: "warn" },
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
  const unitFilter = typeof sp.unidade === "string" ? sp.unidade : "";
  const kindFilter = typeof sp.tipo === "string" && sp.tipo in PERSON_KINDS ? (sp.tipo as PersonKind) : null;
  const tab = sp.aba === "pessoas" ? "pessoas" : "hoje";
  const now = new Date();
  const today = brtParts(now).day;
  const dayStart = brt(today, "00:00");
  const dayEnd = new Date(dayStart.getTime() + 86400_000);
  const ci = { contains: q, mode: "insensitive" as const };

  const unitRows = await db.unit.findMany({ where: { building: { condominiumId: condoId } }, include: { building: true } });
  const sorted = unitRows.sort(byUnit);
  const units = sorted.map((u) => ({ id: u.id, label: unitLabel(u, true) }));
  const label = (id: string | null) => units.find((u) => u.id === id)?.label ?? "Condomínio";
  // Busca também pela unidade ("101", "Torre A 101")
  const unitMatches = q ? units.filter((u) => u.label.toLowerCase().replace(/[·\s]+/g, " ").includes(q.toLowerCase())).map((u) => u.id) : [];

  const [pendingCount, todayBookings, authorized, inside, todayEntries, enteredToday] = await Promise.all([
    db.booking.count({ where: { condominiumId: condoId, status: "pending", endAt: { gt: now } } }),
    db.booking.findMany({
      where: { condominiumId: condoId, status: "approved", startAt: { lt: dayEnd }, endAt: { gt: dayStart } },
      include: { commonArea: { select: { name: true } }, unit: { include: { building: true } }, guests: { orderBy: { name: "asc" } } },
      orderBy: { startAt: "asc" },
    }),
    // Autorizados para hoje: visitante/prestador com prazo que vale hoje, ou cadastrado nas últimas 24 h
    db.unitPerson.findMany({
      where: {
        condominiumId: condoId, kind: { in: ["visitor", "provider"] },
        OR: [{ validUntil: { gte: dayStart } }, { createdAt: { gte: new Date(now.getTime() - 86400_000) } }],
      },
      orderBy: { name: "asc" }, take: 60,
    }),
    db.accessEntry.findMany({ where: { condominiumId: condoId, exitedAt: null, kind: { not: "resident" }, createdAt: { gte: new Date(now.getTime() - 86400_000) } }, orderBy: { createdAt: "desc" } }),
    db.accessEntry.findMany({ where: { condominiumId: condoId, OR: [{ createdAt: { gte: dayStart } }, { exitedAt: { gte: dayStart } }] }, orderBy: { createdAt: "desc" }, take: 120 }),
    db.accessEntry.findMany({ where: { condominiumId: condoId, createdAt: { gte: dayStart }, personId: { not: null } }, select: { personId: true } }),
  ]);
  const entered = new Set(enteredToday.map((e) => e.personId));
  const expectedPeople = authorized.filter((p) => !entered.has(p.id));
  const waitingGuests = todayBookings.reduce((n, b) => n + b.guests.filter((g) => !g.checkedInAt).length, 0);
  const entriesToday = todayEntries.filter((e) => e.createdAt >= dayStart).length;
  // Linha do tempo: entradas e saídas do dia, da mais recente para a mais antiga
  const timeline = todayEntries
    .flatMap((e) => [
      ...(e.createdAt >= dayStart ? [{ at: e.createdAt, out: false, e }] : []),
      ...(e.exitedAt && e.exitedAt >= dayStart ? [{ at: e.exitedAt, out: true, e }] : []),
    ])
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 40);

  const gateKinds: PersonKind[] = user.role === "syndic" || user.role === "superadmin" ? ["visitor", "provider", "resident"] : ["visitor", "provider"];

  // Busca e aba Pessoas
  const showPeople = tab === "pessoas" || !!q;
  const personWhere: Prisma.UnitPersonWhereInput = {
    condominiumId: condoId,
    ...(q && { OR: [{ name: ci }, { document: ci }, { company: ci }, { notes: ci }, ...(unitMatches.length ? [{ unitId: { in: unitMatches } }] : [])] }),
    ...(unitFilter && { unitId: unitFilter }),
    ...(kindFilter && { kind: kindFilter }),
  };
  const [people, accounts, guests, entryHits] = showPeople
    ? await Promise.all([
        db.unitPerson.findMany({ where: personWhere, orderBy: { name: "asc" }, take: 300 }),
        !kindFilter || kindFilter === "resident"
          ? db.userUnit.findMany({
              where: {
                unit: { building: { condominiumId: condoId } }, user: { status: "active" },
                ...(q && { OR: [{ user: { name: ci } }, ...(unitMatches.length ? [{ unitId: { in: unitMatches } }] : [])] }),
                ...(unitFilter && { unitId: unitFilter }),
              },
              include: { user: { select: { name: true, phone: true } } },
              take: 300,
            })
          : [],
        q ? db.bookingGuest.findMany({ where: { OR: [{ name: ci }, { document: ci }], booking: { condominiumId: condoId, status: "approved", startAt: { lt: dayEnd }, endAt: { gt: dayStart } } }, include: { booking: { include: { commonArea: { select: { name: true } } } } }, take: 30 }) : [],
        // Placa do carro e anotações das entradas dos últimos 30 dias
        q ? db.accessEntry.findMany({ where: { condominiumId: condoId, createdAt: { gte: new Date(now.getTime() - 30 * 86400_000) }, OR: [{ notes: ci }, { name: ci }, { document: ci }] }, orderBy: { createdAt: "desc" }, take: 15 }) : [],
      ])
    : [[], [], [], []];

  // Agrupa por unidade (na ordem de torre e número)
  const groups = sorted
    .map((u) => ({
      id: u.id,
      label: unitLabel(u, true),
      accounts: accounts.filter((a) => a.unitId === u.id),
      people: people.filter((p) => p.unitId === u.id),
    }))
    .filter((g) => g.accounts.length || g.people.length);

  return (
    <div className="mx-auto max-w-6xl animate-in">
      <PageHeader eyebrow="Portaria" title="Portaria" description="Quem é esperado, quem está no condomínio e o que aconteceu hoje." />

      <div className="mb-5 flex flex-wrap items-start gap-2">
        <form action="/portaria" className="flex min-w-60 flex-1 gap-2">
          {tab === "pessoas" && <input type="hidden" name="aba" value="pessoas" />}
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input name="q" defaultValue={q} placeholder="Nome, documento, unidade ou placa" className="pl-9" />
          </div>
          <button className={buttonClass("outline")}>Buscar</button>
        </form>
        <GateQuickActions units={units} kinds={gateKinds} />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Esperados hoje" value={waitingGuests + expectedPeople.length} />
        <Stat label="No condomínio agora" value={inside.length} tone={inside.length ? "brand" : undefined} />
        <Stat label="Entradas hoje" value={entriesToday} />
        <Link href="/reservas"><Stat label="Reservas para aprovar" value={pendingCount} tone={pendingCount ? "warn" : undefined} /></Link>
      </div>

      {q && (
        <Card className="mb-6">
          <CardHeader title={`Resultado para “${q}”`} action={<Link href={tab === "pessoas" ? "/portaria?aba=pessoas" : "/portaria"} className="text-xs font-medium text-brand hover:underline">Limpar</Link>} />
          {guests.length > 0 && (
            <ul className="divide-y divide-line border-b border-line">
              {guests.map((g) => (
                <li key={g.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                  <div className="min-w-0 flex-1"><p className="font-medium">{g.name}</p><p className="text-xs text-muted">Convidado · {g.booking.commonArea.name}{g.checkedInAt && ` · chegou ${fmtDateTime(g.checkedInAt)}`}</p></div>
                  <ArrivalButton guestId={g.id} arrived={!!g.checkedInAt} />
                </li>
              ))}
            </ul>
          )}
          <UnitGroups groups={groups} units={units} kinds={gateKinds} open />
          {entryHits.length > 0 && (
            <div className="border-t border-line">
              <p className="px-5 pt-3 text-xs font-medium text-muted">Entradas nos últimos 30 dias</p>
              <ul className="divide-y divide-line">
                {entryHits.map((e) => (
                  <li key={e.id} className="px-5 py-2 text-sm">
                    <span className="font-medium">{e.name}</span> <span className="text-xs text-muted">· {label(e.unitId)} · {fmtDateTime(e.createdAt)}{e.notes && ` · ${e.notes}`}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      <nav className="mb-5 flex gap-1 border-b border-line">
        {([["hoje", "Hoje"], ["pessoas", "Pessoas por unidade"]] as const).map(([k, l]) => (
          <Link key={k} href={k === "pessoas" ? "/portaria?aba=pessoas" : "/portaria"} className={cx("-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition", tab === k ? "border-brand text-brand" : "border-transparent text-muted hover:text-fg")}>{l}</Link>
        ))}
      </nav>

      {tab === "hoje" ? (
        <div className="grid items-start gap-6 lg:grid-cols-2">
          {/* Esperados: convidados das reservas de hoje + autorizados */}
          <Card>
            <CardHeader title="Esperados hoje" subtitle="Convidados das reservas e visitantes ou prestadores autorizados." />
            {todayBookings.map((b) => {
              const waiting = b.guests.filter((g) => !g.checkedInAt);
              return (
                <div key={b.id} className="border-b border-line px-5 py-3">
                  <Link href={`/reservas/${b.id}`} className="flex items-baseline gap-2 text-sm hover:text-brand">
                    <span className="font-semibold">{b.commonArea.name}</span>
                    <span className="text-xs text-muted">{brtParts(b.startAt).hm}–{brtParts(b.endAt).hm} · {b.unit ? unitLabel(b.unit, true) : "Condomínio"}</span>
                    <span className="ml-auto shrink-0 text-xs text-muted">{b.guests.length - waiting.length} de {b.guests.length} chegaram</span>
                  </Link>
                  {waiting.length > 0 && (
                    <ul className="mt-1 divide-y divide-line">
                      {waiting.slice(0, 12).map((g) => (
                        <li key={g.id} className="flex items-center gap-2 py-1.5 text-sm">
                          <span className="min-w-0 flex-1 truncate">{g.name}{g.document && <span className="text-xs text-muted"> · {g.document}</span>}</span>
                          <Badge tone="ok">Convidado</Badge>
                          <ArrivalButton guestId={g.id} arrived={false} />
                        </li>
                      ))}
                    </ul>
                  )}
                  {waiting.length > 12 && <Link href={`/reservas/${b.id}`} className="mt-1 block text-xs font-medium text-brand hover:underline">Ver os outros {waiting.length - 12} convidados</Link>}
                </div>
              );
            })}
            {expectedPeople.length > 0 && (
              <>
                <p className="px-5 pt-3 text-xs font-medium text-muted">Autorizados para hoje</p>
                <ul className="divide-y divide-line">
                  {expectedPeople.map((p) => (
                    <li key={p.id} className="flex items-center gap-2 px-5 py-2 text-sm">
                      <span className="min-w-0 flex-1 truncate">{p.name} <span className="text-xs text-muted">· {label(p.unitId)}{p.company && ` · ${p.company}`}</span></span>
                      <Badge tone={KIND[p.kind].tone}>{KIND[p.kind].label}</Badge>
                      <EntryButton personId={p.id} name={p.name} />
                    </li>
                  ))}
                </ul>
              </>
            )}
            {!todayBookings.length && !expectedPeople.length && <p className="px-5 py-6 text-sm text-muted">Ninguém esperado hoje. Visitantes cadastrados pelos moradores com data para hoje aparecem aqui.</p>}
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader title={`No condomínio agora (${inside.length})`} subtitle="Quem entrou e ainda não saiu." />
              {inside.length ? (
                <ul className="divide-y divide-line">
                  {inside.map((e) => (
                    <li key={e.id} className="flex items-center gap-2 px-5 py-2 text-sm">
                      <span className="min-w-0 flex-1 truncate">{e.name} <span className="text-xs text-muted">· {e.notes?.startsWith("Convidado: ") ? e.notes.slice(11) : label(e.unitId)} · desde {brtParts(e.createdAt).hm}</span></span>
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
                <ol className="space-y-0 px-5 py-3">
                  {timeline.map((t, i) => (
                    <li key={i} className="relative flex gap-3 pb-3 pl-4 text-sm before:absolute before:left-[3px] before:top-2 before:h-full before:w-px before:bg-line last:before:hidden">
                      <span className={cx("absolute left-0 top-1.5 size-[7px] rounded-full", t.out ? "bg-muted" : "bg-brand")} />
                      <span className="w-11 shrink-0 font-num text-xs text-muted">{brtParts(t.at).hm}</span>
                      <span className="min-w-0 flex-1">
                        {t.out ? "Saiu" : "Entrou"} <b className="font-medium">{t.e.name}</b>
                        <span className="text-xs text-muted"> · {KIND[t.e.kind]?.label ?? t.e.kind}, {t.e.notes?.startsWith("Convidado: ") ? t.e.notes.slice(11) : label(t.e.unitId)}{!t.out && ` · ${t.e.createdBy}`}</span>
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
          <form className="flex flex-wrap gap-2 border-b border-line p-4" action="/portaria">
            <input type="hidden" name="aba" value="pessoas" />
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
          {q ? <p className="px-5 py-4 text-sm text-muted">Veja o resultado da busca acima.</p> : <UnitGroups groups={groups} units={units} kinds={gateKinds} open={!!unitFilter || groups.length <= 3} />}
        </Card>
      )}
    </div>
  );
}

type Group = {
  id: string; label: string;
  accounts: { unitId: string; role: string; user: { name: string; phone: string | null } }[];
  people: Parameters<typeof toPersonData>[0][];
};

/** Pessoas agrupadas por unidade: contas do app (moradores) e cadastradas (moradores, visitantes, prestadores). */
function UnitGroups({ groups, units, kinds, open }: { groups: Group[]; units: { id: string; label: string }[]; kinds: PersonKind[]; open?: boolean }) {
  if (!groups.length) return <p className="px-5 py-6 text-sm text-muted">Ninguém encontrado.</p>;
  return (
    <div className="divide-y divide-line">
      {groups.map((g) => {
        const count = (k: string) => g.people.filter((p) => p.kind === k).length + (k === "resident" ? g.accounts.length : 0);
        const summary = (["resident", "visitor", "provider"] as const).map((k) => count(k) && `${count(k)} ${PERSON_KINDS[k].plural.toLowerCase().replace(" de serviço", "")}`).filter(Boolean).join(" · ");
        return (
          <details key={g.id} open={open} className="group">
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
              {g.people.map((p) => (
                <PersonRow key={p.id} p={toPersonData(p, PERSON_KINDS[p.kind as PersonKind]?.label)} units={units} kinds={kinds} canEdit={kinds.includes(p.kind as PersonKind)} gate />
              ))}
            </ul>
          </details>
        );
      })}
    </div>
  );
}
