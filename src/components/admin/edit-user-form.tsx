"use client";

import { useState } from "react";
import { updateUser } from "@/app/actions/admin";
import { useFormSubmit } from "@/components/use-form-submit";
import { Alert, Field, Input, Select, cx } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { ROLE_LABEL, type Role } from "@/lib/roles";

export type EditableUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  phone: string | null;
  cpf: string | null;
  company: string | null;
  specialty: string | null;
  condominiumId: string | null;
  status: string;
  unitId: string | null;
  unitRole: string | null;
};

type Props = {
  user: EditableUser;
  roles: Role[];
  /** Editando a própria conta: perfil, condomínio e status ficam travados. */
  self?: boolean;
  /** Só o superadmin escolhe o condomínio. */
  condos?: { id: string; name: string }[];
  units: { id: string; label: string; condominiumId: string }[];
};

export function EditUserForm({ user, roles, condos, units, self }: Props) {
  const [state, form, pending] = useFormSubmit(updateUser.bind(null, user.id));
  const [role, setRole] = useState<Role>(user.role);
  const [condo, setCondo] = useState(user.condominiumId ?? condos?.[0]?.id ?? "");
  const [status, setStatus] = useState(user.status);
  const unitOptions = condos ? units.filter((u) => u.condominiumId === condo) : units;
  const livesInUnit = role === "council" || role === "resident";

  return (
    <form {...form} className="space-y-8">
      <section className="space-y-5">
        <h2 className="font-display text-base font-semibold">Dados pessoais</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Nome completo"><Input name="name" defaultValue={user.name} required minLength={3} /></Field>
          <Field label="E-mail (login)"><Input name="email" type="email" defaultValue={user.email} required /></Field>
          <Field label="Telefone / WhatsApp"><Input name="phone" defaultValue={user.phone ?? ""} /></Field>
          <Field label={role === "provider" ? "CPF / CNPJ" : "CPF"}><Input name="cpf" defaultValue={user.cpf ?? ""} /></Field>
        </div>
      </section>

      <section className={cx("space-y-5 border-t border-line pt-6", self && "hidden")}>
        <h2 className="font-display text-base font-semibold">Acesso</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Perfil">
            <Select name="role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </Select>
          </Field>
          {condos && role !== "superadmin" && (
            <Field label="Condomínio" hint={condo !== user.condominiumId ? "Trocar de condomínio remove o vínculo com a unidade." : undefined}>
              <Select name="condominiumId" value={condo} onChange={(e) => setCondo(e.target.value)} required>
                <option value="" disabled>Selecione…</option>
                {condos.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
          )}
        </div>
        <div>
          <p className="mb-1.5 text-[13px] font-medium text-fg-2">Status</p>
          <input type="hidden" name="status" value={status} />
          <div className="inline-grid grid-cols-2 gap-1 rounded-xl bg-bg-2 p-1 text-sm">
            {([["active", "Ativo"], ["inactive", "Inativo"]] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setStatus(k)} className={cx("rounded-lg px-4 py-1.5 font-medium transition", status === k ? (k === "active" ? "bg-surface text-ok shadow-card" : "bg-surface text-bad shadow-card") : "text-muted hover:text-fg")}>
                {l}
              </button>
            ))}
          </div>
          {status === "inactive" && <p className="mt-1.5 text-xs text-muted">Usuários inativos não conseguem entrar no sistema.</p>}
        </div>
      </section>
      {self && (
        <p className="rounded-xl bg-bg-2 px-4 py-3 text-xs text-muted">
          Esta é a sua conta: perfil de acesso e status não podem ser alterados por você mesmo. Ao trocar o e-mail, o endereço antigo recebe um aviso.
        </p>
      )}

      {role === "provider" && (
        <section className="space-y-5 border-t border-line pt-6">
          <h2 className="font-display text-base font-semibold">Prestador</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Empresa"><Input name="company" defaultValue={user.company ?? ""} /></Field>
            <Field label="Especialidade"><Input name="specialty" defaultValue={user.specialty ?? ""} placeholder="Pintura, Elétrica…" /></Field>
          </div>
        </section>
      )}

      {livesInUnit && (
        <section className="space-y-5 border-t border-line pt-6">
          <h2 className="font-display text-base font-semibold">Unidade</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Unidade">
              <Select key={condo} name="unitId" defaultValue={condo === user.condominiumId ? user.unitId ?? "" : ""}>
                <option value="">Sem vínculo</option>
                {unitOptions.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
              </Select>
            </Field>
            <Field label="Vínculo">
              <Select name="unitRole" defaultValue={user.unitRole ?? "owner"}>
                <option value="owner">Proprietário</option>
                <option value="tenant">Inquilino</option>
                <option value="dependent">Dependente</option>
              </Select>
            </Field>
          </div>
        </section>
      )}

      {state?.error && <Alert>{state.error}</Alert>}
      {state?.message && <Alert tone="ok">{state.message}</Alert>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6">
        <p className="text-xs text-muted">{self ? "Sua senha é alterada em Meu perfil." : "A senha é redefinida pelo ícone de chave na lista de usuários."}</p>
        <SubmitButton pending={pending} pendingText="Salvando…">Salvar alterações</SubmitButton>
      </div>
    </form>
  );
}
