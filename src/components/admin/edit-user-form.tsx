"use client";

import { useState } from "react";
import { updateUser } from "@/app/actions/admin";
import { useFormSubmit } from "@/components/use-form-submit";
import { Alert, Field, Input, Select, cx } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { ROLE_LABEL, type Role } from "@/lib/roles";
import { PERMISSION_KEYS, SYNDIC_PERMISSIONS } from "@/lib/permissions";

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
  permissions: string;
};

type Props = {
  user: EditableUser;
  roles: Role[];
  /** Editando a própria conta: perfil, condomínio e status ficam travados. */
  self?: boolean;
  /** Só o superadmin escolhe o condomínio. */
  condos?: { id: string; name: string }[];
  units: { id: string; label: string; condominiumId: string }[];
  /** Superadmin editando: pode conceder permissões extras ao síndico. */
  canGrant?: boolean;
  /** Superadmin: outros condomínios do usuário (além do principal). */
  memberships?: { condominiumId: string; role: string; permissions: string }[];
};

export function EditUserForm({ user, roles, condos, units, self, canGrant, memberships }: Props) {
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

      {canGrant && role === "syndic" && (
        <section className="space-y-3 border-t border-line pt-6">
          <input type="hidden" name="permsForm" value="1" />
          <div>
            <h2 className="font-display text-base font-semibold">Permissões do síndico</h2>
            <p className="text-xs text-muted">Recursos extras que só o superadmin libera.</p>
          </div>
          {PERMISSION_KEYS.map((k) => (
            <label key={k} className="flex items-start gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3">
              <input type="checkbox" name="perm" value={k} defaultChecked={user.permissions.split(",").includes(k)} className="mt-0.5 size-4 accent-[var(--brand)]" />
              <span>
                <span className="block text-sm font-medium">{SYNDIC_PERMISSIONS[k].label}</span>
                <span className="block text-xs text-muted">{SYNDIC_PERMISSIONS[k].hint}</span>
              </span>
            </label>
          ))}
        </section>
      )}

      {canGrant && !self && role !== "superadmin" && condos && (
        <ExtraMemberships initial={memberships ?? []} condos={condos.filter((c) => c.id !== condo)} />
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

const MEMBER_ROLES: Role[] = ["syndic", "caretaker", "provider", "council", "resident"];

/** Outros condomínios do usuário (síndico profissional, prestador de vários prédios…). */
function ExtraMemberships({ initial, condos }: { initial: { condominiumId: string; role: string; permissions: string }[]; condos: { id: string; name: string }[] }) {
  const [rows, setRows] = useState(initial.filter((r) => condos.some((c) => c.id === r.condominiumId)));
  const free = condos.filter((c) => !rows.some((r) => r.condominiumId === c.id));
  const set = (i: number, patch: Partial<(typeof rows)[number]>) => setRows((x) => x.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const togglePerm = (i: number, p: string) => {
    const cur = rows[i].permissions.split(",").filter(Boolean);
    set(i, { permissions: (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]).join(",") });
  };

  return (
    <section className="space-y-3 border-t border-line pt-6">
      <input type="hidden" name="membershipsForm" value="1" />
      <input type="hidden" name="memberships" value={JSON.stringify(rows)} />
      <div>
        <h2 className="font-display text-base font-semibold">Outros condomínios</h2>
        <p className="text-xs text-muted">Para síndico profissional ou prestador que atende vários prédios. A pessoa troca de condomínio pelo cartão no menu.</p>
      </div>
      {rows.map((r, i) => (
        <div key={r.condominiumId} className="space-y-2 rounded-xl border border-line bg-surface-2 p-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_11rem_auto]">
            <Select value={r.condominiumId} onChange={(e) => set(i, { condominiumId: e.target.value })} aria-label="Condomínio">
              {[...condos.filter((c) => c.id === r.condominiumId), ...free].map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Select value={r.role} onChange={(e) => set(i, { role: e.target.value, permissions: e.target.value === "syndic" ? r.permissions : "" })} aria-label="Perfil neste condomínio">
              {MEMBER_ROLES.map((k) => <option key={k} value={k}>{ROLE_LABEL[k]}</option>)}
            </Select>
            <button type="button" onClick={() => setRows((x) => x.filter((_, k) => k !== i))} className="h-10 rounded-xl px-3 text-sm text-bad hover:bg-bad/10">Remover</button>
          </div>
          {r.role === "syndic" && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 px-1">
              {PERMISSION_KEYS.map((p) => (
                <label key={p} className="flex items-center gap-2 text-xs text-fg-2">
                  <input type="checkbox" checked={r.permissions.split(",").includes(p)} onChange={() => togglePerm(i, p)} className="size-3.5 accent-[var(--brand)]" />
                  {SYNDIC_PERMISSIONS[p].label}
                </label>
              ))}
            </div>
          )}
        </div>
      ))}
      {free.length > 0 && (
        <button type="button" onClick={() => setRows((x) => [...x, { condominiumId: free[0].id, role: "syndic", permissions: "" }])} className="text-sm font-medium text-brand hover:underline">
          + Adicionar condomínio
        </button>
      )}
    </section>
  );
}
