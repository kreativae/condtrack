import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth";
import { MANAGEABLE_ROLES, ROLE_LABEL, type Role } from "@/lib/roles";
import { fmtDateTime } from "@/lib/format";
import { Avatar, Badge, Card, PageHeader } from "@/components/ui";
import { EditUserForm } from "./edit-user-form";
import { byUnit, unitLabel } from "@/lib/units";

/** Página de edição de usuário (superadmin: qualquer um; síndico: pessoas do condomínio). */
export async function EditUserPage({ me, id, back }: { me: CurrentUser; id: string; back: string }) {
  const admin = me.role === "superadmin";
  const u = await db.user.findUnique({ where: { id }, include: { units: true, condominium: { select: { name: true } } } });
  const roles = MANAGEABLE_ROLES[me.role];
  // Mesmas regras das ações do servidor: síndico só no próprio condomínio e perfis gerenciáveis
  // Superadmin edita os próprios dados (sem mudar perfil/status); síndico usa Meu perfil
  const self = !!u && u.id === me.id;
  if (!u || (self && !admin)) notFound();
  if (!self && !admin && (u.condominiumId !== me.condominiumId || !roles.includes(u.role as Role))) notFound();

  const [condos, units] = await Promise.all([
    admin ? db.condominium.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }) : [],
    db.unit.findMany({
      where: admin ? {} : { building: { condominiumId: me.condominiumId! } },
      include: { building: true },
      orderBy: [{ building: { name: "asc" } }, { number: "asc" }],
    }),
  ]);

  return (
    <div className="mx-auto max-w-3xl animate-in">
      <Link href={back} className="mb-6 inline-flex items-center gap-2 text-xs font-medium text-muted hover:text-brand">
        <ArrowLeft className="size-3.5" /> Voltar
      </Link>
      <PageHeader eyebrow={admin ? "Usuários" : me.condominium?.name} title="Editar usuário" />
      <Card className="mb-6 flex items-center gap-4 p-5">
        <Avatar name={u.name} src={u.avatarUrl} size={48} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 font-medium">
            {u.name}
            <Badge tone={u.role === "syndic" || u.role === "superadmin" ? "brand" : "muted"}>{ROLE_LABEL[u.role as Role]}</Badge>
            {u.status !== "active" && <Badge tone="bad">Inativo</Badge>}
          </p>
          <p className="text-xs text-muted">
            {u.condominium?.name ?? "Plataforma"} · cadastrado em {fmtDateTime(u.createdAt)} · {u.lastLoginAt ? `último acesso ${fmtDateTime(u.lastLoginAt)}` : "nunca acessou"}
          </p>
        </div>
      </Card>
      <Card className="p-6 sm:p-8">
        <EditUserForm
          user={{
            id: u.id, name: u.name, email: u.email, role: u.role as Role, phone: u.phone, cpf: u.cpf, company: u.company, specialty: u.specialty,
            condominiumId: u.condominiumId, status: u.status, unitId: u.units[0]?.unitId ?? null, unitRole: u.units[0]?.role ?? null,
          }}
          roles={roles}
          self={self}
          condos={admin ? condos : undefined}
          units={units.sort(byUnit).map((x) => ({ id: x.id, label: unitLabel(x, true), condominiumId: x.building.condominiumId }))}
        />
      </Card>
    </div>
  );
}
