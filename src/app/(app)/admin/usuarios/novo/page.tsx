import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { MANAGEABLE_ROLES, isRole } from "@/lib/roles";
import { UserForm } from "@/components/admin/user-form";
import { Card, PageHeader } from "@/components/ui";
import { byUnit, unitLabel } from "@/lib/units";

export const metadata: Metadata = { title: "Novo usuário" };

export default async function AdminNewUserPage({ searchParams }: PageProps<"/admin/usuarios/novo">) {
  await requireUser("superadmin");
  const { role } = await searchParams;
  const [condos, units] = await Promise.all([
    db.condominium.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.unit.findMany({ include: { building: true }, orderBy: [{ building: { name: "asc" } }, { number: "asc" }] }),
  ]);
  return (
    <div className="mx-auto max-w-2xl animate-in">
      <PageHeader eyebrow="Usuários" title="Novo usuário" description="Uma senha provisória será gerada para o primeiro acesso." />
      <Card className="p-6 sm:p-8">
        <UserForm
          roles={MANAGEABLE_ROLES.superadmin}
          defaultRole={typeof role === "string" && isRole(role) ? role : "syndic"}
          condos={condos}
          units={units.sort(byUnit).map((u) => ({ id: u.id, label: unitLabel(u, true), condominiumId: u.building.condominiumId }))}
        />
      </Card>
    </div>
  );
}
