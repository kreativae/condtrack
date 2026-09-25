import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/roles";
import { fmtDateTime } from "@/lib/format";
import { logout } from "@/app/actions/auth";
import { Avatar, Card, CardHeader, PageHeader, buttonClass } from "@/components/ui";
import { EmailForm, PasswordForm, ProfileForm } from "./forms";
import { PasskeysCard } from "./passkeys";
import { db } from "@/lib/db";
import { passkeyConfig } from "@/lib/passkeys";
import { unitLabel } from "@/lib/units";

export const metadata: Metadata = { title: "Meu perfil" };

export default async function ProfilePage() {
  const user = await requireUser();
  const [passkeys, pk] = await Promise.all([db.passkey.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }), passkeyConfig()]);
  return (
    <div className="mx-auto max-w-3xl animate-in">
      <PageHeader eyebrow="Conta" title="Meu perfil" />
      <Card brand className="mb-6 flex flex-col items-center gap-5 p-6 sm:flex-row">
        <Avatar name={user.name} src={user.avatarUrl} size={72} />
        <div className="text-center sm:text-left">
          <p className="font-display font-semibold text-2xl">{user.name}</p>
          <p className="text-sm text-muted">{user.email}</p>
          <p className="mt-1 text-xs font-medium text-brand">
            {ROLE_LABEL[user.role]}
            {user.condominium && ` · ${user.condominium.name}`}
          </p>
          {user.units.map((u) => (
            <p key={u.unitId} className="mt-1 text-sm text-fg-2">{unitLabel(u.unit)} ({u.role === "owner" ? "proprietário" : u.role === "tenant" ? "inquilino" : "dependente"})</p>
          ))}
          <p className="mt-2 text-xs text-muted">Último acesso: {fmtDateTime(user.lastLoginAt)}</p>
        </div>
      </Card>
      <div className="grid gap-6 md:grid-cols-2">
        <Card><CardHeader title="Dados pessoais" /><div className="p-5"><ProfileForm name={user.name} phone={user.phone} /></div></Card>
        <Card><CardHeader title="Segurança" /><div className="p-5"><PasswordForm /></div></Card>
        <Card className="md:col-span-2">
          <CardHeader title="E-mail de acesso" subtitle="O e-mail que você usa para entrar. O endereço antigo recebe um aviso da troca." />
          <div className="p-5 md:max-w-md"><EmailForm email={user.email} /></div>
        </Card>
      </div>
      <Card className="mt-6">
        <CardHeader title="Face ID / biometria" subtitle="Login sem senha neste e em outros aparelhos" />
        <div className="p-5">
          <PasskeysCard
            items={passkeys.map((p) => ({ id: p.id, name: p.name, createdAt: p.createdAt.toISOString(), lastUsedAt: p.lastUsedAt?.toISOString() ?? null }))}
            disabledReason={!pk.enabled ? "O login com biometria está desativado pela administração." : user.impersonator ? "Indisponível em modo de visualização." : undefined}
          />
        </div>
      </Card>
      <form action={logout} className="mt-8 lg:hidden"><button className={buttonClass("outline") + " w-full"}>Sair</button></form>
    </div>
  );
}
