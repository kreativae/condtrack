import type { Metadata } from "next";
import { UserPlus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { MANAGEABLE_ROLES } from "@/lib/roles";
import { UsersTable } from "@/components/admin/users-table";
import { FrozenPage, FrozenTop } from "@/components/frozen";
import { LinkButton, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Pessoas" };

export default async function PeoplePage({ searchParams }: PageProps<"/usuarios">) {
  const me = await requireUser("syndic");
  const params = await searchParams;
  const { role } = params;
  const roles = MANAGEABLE_ROLES.syndic;
  return (
    <FrozenPage>
      <FrozenTop>
        <PageHeader
          eyebrow={me.condominium?.name}
          title="Moradores, equipe e prestadores"
          actions={<LinkButton href={`/usuarios/novo${typeof role === "string" ? `?role=${role}` : ""}`}><UserPlus className="size-4" />Cadastrar</LinkButton>}
        />
      </FrozenTop>
      <UsersTable params={params} meId={me.id} where={{ condominiumId: me.condominiumId, role: { in: [...roles, "syndic"] } }} base="/usuarios" role={typeof role === "string" ? role : undefined} roles={roles} />
    </FrozenPage>
  );
}
