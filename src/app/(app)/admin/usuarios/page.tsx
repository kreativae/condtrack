import type { Metadata } from "next";
import { Search, UserPlus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { ROLES } from "@/lib/roles";
import { UsersTable } from "@/components/admin/users-table";
import { FrozenPage, FrozenTop } from "@/components/frozen";
import { Input, LinkButton, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Usuários" };

export default async function AdminUsersPage({ searchParams }: PageProps<"/admin/usuarios">) {
  const me = await requireUser("superadmin");
  const params = await searchParams;
  const { role, q } = params;
  return (
    <FrozenPage>
      <FrozenTop>
        <PageHeader
          eyebrow="Superadministração"
          title="Usuários da plataforma"
          description="Use o ícone de olho para visualizar a plataforma como qualquer usuário."
          actions={<LinkButton href="/admin/usuarios/novo"><UserPlus className="size-4" />Novo usuário</LinkButton>}
        />
        <form className="relative mb-4 max-w-md">
          {typeof role === "string" && <input type="hidden" name="role" value={role} />}
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input name="q" defaultValue={typeof q === "string" ? q : ""} placeholder="Buscar por nome ou e-mail" className="pl-9" />
        </form>
      </FrozenTop>
      <UsersTable params={params} meId={me.id} where={{}} base="/admin/usuarios" role={typeof role === "string" ? role : undefined} roles={[...ROLES]} showCondo canImpersonate q={typeof q === "string" ? q : undefined} />
    </FrozenPage>
  );
}
