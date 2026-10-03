import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/roles";
import { fmtDateTime } from "@/lib/format";
import { logout } from "@/app/actions/auth";
import { Avatar, Card, CardHeader, PageHeader, buttonClass } from "@/components/ui";
import { EmailForm, PasswordForm, ProfileForm } from "./forms";
import { PasskeysCard } from "./passkeys";
import { TwoFactorCard } from "./two-factor";
import { PushCard } from "./push";
import { PrivacyCard } from "./privacy";
import { pushPublicKey } from "@/lib/push";
import { recoveryCount } from "@/lib/totp";
import { db } from "@/lib/db";
import { passkeyConfig } from "@/lib/passkeys";
import { unitLabel } from "@/lib/units";

export const metadata: Metadata = { title: "Meu perfil" };

export default async function ProfilePage() {
  const user = await requireUser();
  const [passkeys, pk, tf, devices] = await Promise.all([
    db.passkey.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
    passkeyConfig(),
    db.user.findUnique({ where: { id: user.id }, select: { recoveryCodes: true } }),
    db.pushDevice.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
  ]);
  return (
    <div className="mx-auto max-w-6xl animate-in">
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
      <div className="grid items-start gap-6 lg:grid-cols-2">
        {/* Conta */}
        <div className="space-y-6">
          <Card><CardHeader title="Dados pessoais" /><div className="p-5"><ProfileForm name={user.name} phone={user.phone} /></div></Card>
          <Card>
            <CardHeader title="E-mail de acesso" subtitle="O e-mail que você usa para entrar. O endereço antigo recebe um aviso da troca." />
            <div className="p-5"><EmailForm email={user.email} /></div>
          </Card>
          <Card><CardHeader title="Senha" /><div className="p-5"><PasswordForm /></div></Card>
          <Card id="privacidade">
            <CardHeader title="Privacidade e seus dados" subtitle="Seus direitos pela LGPD" />
            <div className="p-5">
              <PrivacyCard
                acceptedAt={user.termsAcceptedAt?.toISOString() ?? null}
                version={user.termsVersion}
                deletionRequestedAt={user.deletionRequestedAt?.toISOString() ?? null}
                superadmin={user.role === "superadmin"}
                disabledReason={user.impersonator ? "Indisponível em modo de visualização." : undefined}
              />
            </div>
          </Card>
        </div>
        {/* Segurança e avisos */}
        <div className="space-y-6">
          <Card id="duas-etapas">
            <CardHeader title="Verificação em duas etapas" subtitle="Código do app autenticador do celular a cada login com senha" />
            <div className="p-5">
              <TwoFactorCard
                enabledAt={user.totpEnabledAt?.toISOString() ?? null}
                recoveryLeft={recoveryCount(tf?.recoveryCodes ?? "")}
                disabledReason={user.impersonator ? "Indisponível em modo de visualização." : undefined}
              />
            </div>
          </Card>
          <Card>
            <CardHeader title="Face ID / biometria" subtitle="Login sem senha neste e em outros aparelhos" />
            <div className="p-5">
              <PasskeysCard
                items={passkeys.map((p) => ({ id: p.id, name: p.name, createdAt: p.createdAt.toISOString(), lastUsedAt: p.lastUsedAt?.toISOString() ?? null }))}
                disabledReason={!pk.enabled ? "O login com biometria está desativado pela administração." : user.impersonator ? "Indisponível em modo de visualização." : undefined}
              />
            </div>
          </Card>
          <Card id="notificacoes">
            <CardHeader title="Notificações no celular" subtitle="Avisos do Condtrack direto na tela do celular ou do computador" />
            <div className="p-5">
              <PushCard
                publicKey={pushPublicKey()}
                devices={devices.map((d) => ({ id: d.id, name: d.name, endpoint: d.endpoint, createdAt: d.createdAt.toISOString(), lastUsedAt: d.lastUsedAt?.toISOString() ?? null }))}
                disabledReason={user.impersonator ? "Indisponível em modo de visualização." : undefined}
              />
            </div>
          </Card>
        </div>
      </div>
      <form action={logout} className="mt-8 lg:hidden"><button className={buttonClass("outline") + " w-full"}>Sair</button></form>
    </div>
  );
}
