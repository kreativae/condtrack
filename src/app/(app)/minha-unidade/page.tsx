import type { Metadata } from "next";
import { Contact } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PERSON_KINDS, type PersonKind } from "@/lib/booking";
import { gateCondo, myUnits, toGrantData } from "@/lib/booking-server";
import { fmtDateTime } from "@/lib/format";
import { ROLE_LABEL, type Role } from "@/lib/roles";
import { Card, CardHeader, Empty, PageHeader } from "@/components/ui";
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
  const [grants, accounts, entries] = await Promise.all([
    db.accessGrant.findMany({ where: { unitId: { in: ids } }, include: { person: { select: { id: true, name: true, document: true, phone: true, company: true, blockedAt: true } } }, orderBy: { person: { name: "asc" } } }),
    db.userUnit.findMany({ where: { unitId: { in: ids } }, include: { user: { select: { name: true, role: true, status: true } } } }),
    db.accessEntry.findMany({ where: { dests: { some: { unitId: { in: ids } } } }, include: { dests: { select: { unitId: true } } }, orderBy: { createdAt: "desc" }, take: 25 }),
  ]);
  // O morador edita os dados da pessoa só quando ela não está autorizada em outras unidades
  const shared = new Set(
    (await db.accessGrant.findMany({ where: { personId: { in: [...new Set(grants.map((g) => g.personId))] }, OR: [{ unitId: null }, { unitId: { notIn: ids } }] }, select: { personId: true } })).map((g) => g.personId),
  );
  const kinds = Object.keys(PERSON_KINDS) as PersonKind[];
  const now = new Date();

  return (
    <div className="mx-auto max-w-4xl animate-in">
      {header}
      <div className="space-y-6">
        {units.map((u) => {
          const mine = grants.filter((g) => g.unitId === u.id);
          const unitOpt = [{ id: u.id, label: u.label }];
          return (
            <Card key={u.id}>
              <CardHeader title={u.label} subtitle={UNIT_ROLE[u.role] ? `Você: ${UNIT_ROLE[u.role].toLowerCase()}` : undefined} />
              <div className="border-b border-line px-5 py-3">
                <p className="text-xs font-medium text-muted">Com acesso ao app</p>
                <p className="mt-1 text-sm">
                  {accounts.filter((a) => a.unitId === u.id && a.user.status === "active").map((a) => `${a.user.name} (${UNIT_ROLE[a.role]?.toLowerCase() ?? ROLE_LABEL[a.user.role as Role]})`).join(" · ") || "—"}
                </p>
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

        <Card>
          <CardHeader title="Últimas entradas na portaria" subtitle="Você recebe um aviso quando alguém chega para a sua unidade." />
          {entries.length ? (
            <ul className="divide-y divide-line">
              {entries.map((e) => (
                <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 px-5 py-2.5 text-sm">
                  <span className="font-medium">{e.name}</span>
                  <span className="text-xs text-muted">{ENTRY_KIND[e.kind] ?? e.kind}{units.length > 1 && ` · ${e.dests.filter((d) => ids.includes(d.unitId)).map((d) => units.find((x) => x.id === d.unitId)?.label).join(", ")}`}</span>
                  <span className="ml-auto text-xs text-muted">{fmtDateTime(e.createdAt)} · {e.createdBy}</span>
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
