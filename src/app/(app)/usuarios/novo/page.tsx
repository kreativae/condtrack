import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { MANAGEABLE_ROLES, isRole } from "@/lib/roles";
import { UserForm } from "@/components/admin/user-form";
import { Card, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Cadastrar pessoa" };

export default async function NewPersonPage({ searchParams }: PageProps<"/usuarios/novo">) {
  const me = await requireUser("syndic");
  const { role } = await searchParams;
  const units = await db.unit.findMany({ where: { building: { condominiumId: me.condominiumId! } }, include: { building: true }, orderBy: [{ building: { name: "asc" } }, { number: "asc" }] });
  return (
    <div className="mx-auto max-w-2xl animate-in">
      <PageHeader eyebrow="Pessoas" title="Novo cadastro" description="Uma senha provisória será gerada para o primeiro acesso." />
      <Card className="p-6 sm:p-8">
        <UserForm
          roles={MANAGEABLE_ROLES.syndic}
          defaultRole={typeof role === "string" && isRole(role) ? role : undefined}
          units={units.map((u) => ({ id: u.id, label: `${u.building.name} · ${u.number}`, condominiumId: me.condominiumId! }))}
        />
      </Card>
    </div>
  );
}
