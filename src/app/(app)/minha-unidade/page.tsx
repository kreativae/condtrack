import type { Metadata } from "next";
import { Contact, MapPin, Smartphone } from "lucide-react";
import { parcelOverdue, waitLabel } from "@/lib/parcels";
import { thumb } from "@/lib/media-url";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PERSON_KINDS, type PersonKind } from "@/lib/booking";
import { gateCondo, myUnits, toGrantData } from "@/lib/booking-server";
import { fmtDateTime, nowMs } from "@/lib/format";
import { ROLE_LABEL, type Role } from "@/lib/roles";
import { Badge, Card, CardHeader, Empty, PageHeader } from "@/components/ui";
import { AddGrant, GrantRow } from "@/components/portaria/people";

export const metadata: Metadata = { title: "Minha unidade" };

const UNIT_ROLE: Record<string, string> = { owner: "Proprietário", tenant: "Inquilino", dependent: "Dependente" };
const ENTRY_KIND: Record<string, string> = { visitor: "Visitante", provider: "Prestador", delivery: "Entrega", resident: "Morador", guest: "Convidado" };

export default async function MyUnitPage() {
  const user = await requireUser();
  const condoId = await gateCondo(user);
  const units = condoId ? myUnits(user, condoId) : [];
  const header = <PageHeader eyebrow="Portaria" title="Minha unidade" description="Quem mora com você e quem pode entrar: visitantes, prestadores e entregas, com dias e horários. A portaria consulta esta lista." />;
  if (!condoId || !units.length) {
    return <div className="mx-auto max-w-4xl animate-in">{header}<Card><Empty icon={<Contact />} title="Sem unidade vinculada">Peça ao síndico para vincular sua unidade ao seu cadastro.</Empty></Card></div>;
  }
  const ids = units.map((u) => u.id);
  const [grants, accounts, entries, parcels] = await Promise.all([
    db.accessGrant.findMany({ where: { unitId: { in: ids } }, include: { person: { select: { id: true, name: true, document: true, phone: true, company: true, blockedAt: true } } }, orderBy: { person: { name: "asc" } } }),
    db.userUnit.findMany({ where: { unitId: { in: ids } }, include: { user: { select: { name: true, role: true, status: true } } } }),
    db.accessEntry.findMany({ where: { dests: { some: { unitId: { in: ids } } } }, include: { dests: { select: { unitId: true } } }, orderBy: { createdAt: "desc" }, take: 25 }),
    // Encomendas: as que aguardam e as 10 últimas retiradas
    db.parcel.findMany({ where: { unitId: { in: ids }, OR: [{ status: "waiting" }, { deliveredAt: { gte: new Date(nowMs() - 30 * 86400_000) } }] }, orderBy: { receivedAt: "desc" }, take: 40 }),
  ]);
  // O morador edita os dados da pessoa só quando ela não está autorizada em outras unidades
  const shared = new Set(
    (await db.accessGrant.findMany({ where: { personId: { in: [...new Set(grants.map((g) => g.personId))] }, OR: [{ unitId: null }, { unitId: { notIn: ids } }] }, select: { personId: true } })).map((g) => g.personId),
  );
  const kinds = Object.keys(PERSON_KINDS) as PersonKind[];
  const now = new Date();
  const waitingParcels = parcels.filter((p) => p.status === "waiting").reverse();
  const doneParcels = parcels.filter((p) => p.status !== "waiting").slice(0, 10);

  return (
    <div className="mx-auto max-w-6xl animate-in">
      {header}
      {/* Computador: a unidade à esquerda; encomendas e entradas na coluna da direita. Celular: encomendas, unidade, entradas */}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:grid-rows-[auto_1fr]">
        <Card className="lg:col-start-2 lg:row-start-1">
          <CardHeader title={`Encomendas na portaria (${waitingParcels.length})`} subtitle="Você é avisado quando chega e quando alguém retira." />
          {waitingParcels.length ? (
            <ul className="divide-y divide-line">
              {waitingParcels.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3">
                  {p.photoUrl && (
                    <a href={p.photoUrl} target="_blank" rel="noreferrer" title="Ver a foto" className="shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={thumb(p.photoUrl, 480)} alt="" className="size-11 rounded-lg object-cover ring-1 ring-line" />
                    </a>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{[p.carrier, p.description].filter(Boolean).join(" · ") || "Encomenda"}{p.volumes > 1 && ` · ${p.volumes} volumes`}</p>
                    <p className="text-xs text-muted">{p.recipient ? `Para ${p.recipient} · ` : ""}{units.length > 1 && `${units.find((u) => u.id === p.unitId)?.label} · `}recebida {fmtDateTime(p.receivedAt)}</p>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-2.5 py-1 text-xs font-semibold text-brand"><MapPin className="size-3" />{p.location ?? "Na portaria"}</span>
                  <Badge tone={parcelOverdue(p.receivedAt, now) ? "bad" : "muted"}>{waitLabel(p.receivedAt, now)}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-4 text-sm text-muted">Nada aguardando retirada.</p>
          )}
          {doneParcels.length > 0 && (
            <details className="border-t border-line">
              <summary className="cursor-pointer px-5 py-3 text-xs font-medium text-muted hover:text-fg">Retiradas nos últimos 30 dias ({doneParcels.length})</summary>
              <ul className="divide-y divide-line">
                {doneParcels.map((p) => (
                  <li key={p.id} className="px-5 py-2 text-xs text-fg-2">
                    {[p.carrier, p.description].filter(Boolean).join(" · ") || "Encomenda"} · {p.status === "delivered" ? `retirada por ${p.deliveredTo} em ${fmtDateTime(p.deliveredAt)}` : `devolvida: ${p.notes ?? ""}`}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </Card>
        <div className="space-y-6 lg:col-start-1 lg:row-span-2 lg:row-start-1">
        {units.map((u) => {
          const mine = grants.filter((g) => g.unitId === u.id);
          const unitOpt = [{ id: u.id, label: u.label }];
          const appUsers = accounts.filter((a) => a.unitId === u.id && a.user.status === "active");
          const validToday = mine.filter((g) => g.kind !== "resident" && toGrantData(g, now).status === "today").length;
          return (
            <Card key={u.id}>
              <CardHeader title={u.label} subtitle={UNIT_ROLE[u.role] ? `Você: ${UNIT_ROLE[u.role].toLowerCase()}` : undefined} />
              {/* Resumo da unidade */}
              <div className="grid grid-cols-2 gap-2 border-b border-line px-5 py-4 sm:grid-cols-4">
                {[
                  ...kinds.filter((k) => k !== "delivery").map((k) => ({ label: PERSON_KINDS[k].plural, value: mine.filter((g) => g.kind === k).length })),
                  { label: "Valem hoje", value: validToday },
                ].map((x) => (
                  <div key={x.label} className="min-w-0 rounded-xl bg-bg-2 px-3 py-2">
                    <p className="font-display text-lg font-semibold tabular-nums">{x.value}</p>
                    <p className="truncate text-[11px] text-muted">{x.label}</p>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
                <span className="mr-1 inline-flex items-center gap-1.5 text-xs font-medium text-muted"><Smartphone className="size-3.5" />Com acesso ao app</span>
                {appUsers.length ? appUsers.map((a) => (
                  <span key={a.userId} className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand">
                    {a.user.name}<span className="font-normal opacity-75">{UNIT_ROLE[a.role]?.toLowerCase() ?? ROLE_LABEL[a.user.role as Role]}</span>
                  </span>
                )) : <span className="text-xs text-muted">—</span>}
              </div>
              {kinds.map((k) => {
                const list = mine.filter((g) => g.kind === k);
                if (k === "delivery" && !list.length) return null;
                return (
                  <div key={k} className="border-b border-line last:border-0">
                    <p className="px-5 pt-4 text-sm font-semibold">{PERSON_KINDS[k].plural} <span className="font-normal text-muted">({list.length})</span></p>
                    {list.length ? (
                      <ul className="divide-y divide-line">
                        {list.map((g) => (
                          <GrantRow
                            key={g.id}
                            g={toGrantData(g, now)}
                            title={`${g.person.name}${g.person.company ? ` · ${g.person.company}` : ""}${g.person.blockedAt ? " (entrada impedida pela administração)" : ""}`}
                            person={g.person}
                            units={unitOpt}
                            kinds={kinds}
                            canEdit
                            canEditPerson={!shared.has(g.personId)}
                          />
                        ))}
                      </ul>
                    ) : (
                      <p className="px-5 py-2 text-xs text-muted">Ninguém cadastrado.</p>
                    )}
                    <div className="px-5 pb-4 pt-2">
                      <AddGrant label={`Autorizar ${PERSON_KINDS[k].label.toLowerCase()}`} units={unitOpt} kinds={[k, ...kinds.filter((x) => x !== k)]} fixedUnit={u.id} />
                    </div>
                  </div>
                );
              })}
            </Card>
          );
        })}
        </div>

        <Card className="lg:col-start-2 lg:row-start-2">
          <CardHeader title="Últimas entradas na portaria" subtitle="Você recebe um aviso quando alguém chega para a sua unidade." />
          {entries.length ? (
            <ul className="max-h-[480px] divide-y divide-line overflow-auto overscroll-contain">
              {entries.map((e) => (
                <li key={e.id} className="px-5 py-2.5">
                  <p className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate font-medium">{e.name}</span>
                    <span className="shrink-0 text-xs text-muted">{ENTRY_KIND[e.kind] ?? e.kind}</span>
                  </p>
                  <p className="text-xs text-muted">{fmtDateTime(e.createdAt)} · {e.createdBy}{units.length > 1 && ` · ${e.dests.filter((d) => ids.includes(d.unitId)).map((d) => units.find((x) => x.id === d.unitId)?.label).join(", ")}`}</p>
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
