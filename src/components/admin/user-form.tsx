"use client";

import { useFormSubmit } from "@/components/use-form-submit";
import { useState } from "react";
import { createUser } from "@/app/actions/admin";
import { Alert, Field, Input, Select } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { ROLE_LABEL, type Role } from "@/lib/roles";
import { SecretBox } from "./secret-box";

type Props = {
  roles: Role[];
  defaultRole?: Role;
  condos?: { id: string; name: string }[];
  units: { id: string; label: string; condominiumId: string }[];
};

export function UserForm({ roles, defaultRole, condos, units }: Props) {
  const [state, form, pending] = useFormSubmit(createUser);
  const [role, setRole] = useState<Role>(defaultRole && roles.includes(defaultRole) ? defaultRole : roles[0]);
  const [condo, setCondo] = useState(condos?.[0]?.id ?? "");
  const unitOptions = condos ? units.filter((u) => u.condominiumId === condo) : units;

  if (state?.secret) {
    return (
      <div className="space-y-4">
        <Alert tone="ok">{state.message}</Alert>
        <SecretBox secret={state.secret} />
        <a href="" className="inline-block text-sm text-brand underline">Cadastrar outra pessoa</a>
      </div>
    );
  }

  return (
    <form {...form} className="space-y-5">
      <Field label="Perfil">
        <Select name="role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
          {roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </Select>
      </Field>
      {condos && role !== "superadmin" && (
        <Field label="Condomínio">
          <Select name="condominiumId" value={condo} onChange={(e) => setCondo(e.target.value)}>
            {condos.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
      )}
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Nome completo"><Input name="name" required minLength={3} /></Field>
        <Field label="E-mail"><Input name="email" type="email" required /></Field>
        <Field label="Telefone / WhatsApp"><Input name="phone" /></Field>
        <Field label={role === "provider" ? "CPF / CNPJ" : "CPF"}><Input name="cpf" /></Field>
      </div>
      {role === "provider" && (
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Empresa"><Input name="company" /></Field>
          <Field label="Especialidade"><Input name="specialty" placeholder="Pintura, Elétrica…" /></Field>
        </div>
      )}
      {(role === "council" || role === "resident") && (
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Unidade">
            <Select name="unitId" defaultValue="">
              <option value="">Sem vínculo</option>
              {unitOptions.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
            </Select>
          </Field>
          <Field label="Vínculo">
            <Select name="unitRole" defaultValue="owner">
              <option value="owner">Proprietário</option>
              <option value="tenant">Inquilino</option>
              <option value="dependent">Dependente</option>
            </Select>
          </Field>
        </div>
      )}
      {state?.error && <Alert>{state.error}</Alert>}
      <SubmitButton pending={pending}>Cadastrar e gerar senha provisória</SubmitButton>
    </form>
  );
}
