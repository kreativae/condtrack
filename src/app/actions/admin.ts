"use server";

import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, type CurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { slugify } from "@/lib/format";
import { MANAGEABLE_ROLES, ROLE_LABEL, ROLES, type Role } from "@/lib/roles";
import { emailConfig, renderEmail, sendEmail } from "@/lib/email";
import { appUrl } from "@/lib/url";
import { renderTemplate } from "@/lib/messages-server";
import { sendEmailChangedNotice } from "@/lib/account-email";
import { HOUSE_NOUNS, aptNumber, houseNumbers, isHouseNoun, isLayout, type HouseNoun, type Layout } from "@/lib/units";

/** Envia o acesso (senha provisória) por e-mail, se ativado em Configurações → E-mail. */
async function emailAccess(user: { name: string; email: string; role: string }, secret: string, kind: "invite" | "reset") {
  const cfg = await emailConfig();
  if (!cfg.active || !cfg.sendInvites) return null;
  const base = await appUrl();
  // Textos editáveis em Configurações → Mensagens (modelos "invite" e "reset")
  const t = await renderTemplate(kind, { nome: user.name.split(" ")[0], perfil: ROLE_LABEL[user.role as Role] ?? user.role, email: user.email, senha: secret });
  const layout = await renderTemplate("email_layout", {});
  const { html, text } = renderEmail({
    title: t.title,
    lines: t.message.split("\n"),
    cta: { label: t.get("cta"), url: `${base}/login` },
    footnote: t.get("footnote"),
    footer: layout.get("footer"),
  });
  return sendEmail({ to: user.email, subject: t.get("subject"), html, text }, cfg, kind);
}

export type AdminState = { error?: string; ok?: boolean; message?: string; secret?: string } | undefined;

function tempPassword() {
  return randomBytes(9).toString("base64url").slice(0, 12);
}

/** Verifica se `me` pode gerenciar o usuário alvo. */
function canManage(me: CurrentUser, target: { role: string; condominiumId: string | null; id: string }) {
  if (target.id === me.id) return false;
  if (me.role === "superadmin") return true;
  return me.role === "syndic" && target.condominiumId === me.condominiumId && MANAGEABLE_ROLES.syndic.includes(target.role as Role);
}

// ───────────────────────────── Usuários ─────────────────────────────

const userSchema = z.object({
  name: z.string().trim().min(3, "Nome muito curto"),
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
  role: z.enum(ROLES),
  phone: z.string().trim().max(30).optional(),
  cpf: z.string().trim().max(20).optional(),
  company: z.string().trim().max(120).optional(),
  specialty: z.string().trim().max(80).optional(),
  condominiumId: z.string().optional(),
  unitId: z.string().optional(),
  unitRole: z.enum(["owner", "tenant", "dependent"]).optional(),
});

export async function createUser(_: AdminState, form: FormData): Promise<AdminState> {
  const me = await requireUser("superadmin", "syndic");
  const parsed = userSchema.safeParse(Object.fromEntries([...form.entries()].filter(([, v]) => v !== "")));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  if (!MANAGEABLE_ROLES[me.role].includes(d.role)) return { error: "Você não pode cadastrar esse perfil." };

  const condominiumId = d.role === "superadmin" ? null : me.role === "superadmin" ? d.condominiumId : me.condominiumId;
  if (d.role !== "superadmin" && !condominiumId) return { error: "Selecione o condomínio." };
  if (await db.user.findUnique({ where: { email: d.email } })) return { error: "Já existe um usuário com este e-mail." };
  if (d.unitId && !(await db.unit.findFirst({ where: { id: d.unitId, building: { condominiumId: condominiumId! } } }))) return { error: "Unidade inválida." };

  const secret = tempPassword();
  const user = await db.user.create({
    data: {
      name: d.name, email: d.email, role: d.role, phone: d.phone, cpf: d.cpf, company: d.company, specialty: d.specialty,
      condominiumId, passwordHash: await bcrypt.hash(secret, 10),
      units: (d.role === "council" || d.role === "resident") && d.unitId ? { create: { unitId: d.unitId, role: d.unitRole ?? "owner" } } : undefined,
    },
  });
  await audit(me, "create", "user", user.id, { new: { name: d.name, email: d.email, role: d.role }, condominiumId });
  revalidatePath("/usuarios");
  revalidatePath("/admin/usuarios");
  const sent = await emailAccess({ name: d.name, email: d.email, role: d.role }, secret, "invite");
  const how = sent?.ok
    ? `Convite enviado para ${d.email}. A senha provisória também está abaixo, caso precise repassar.`
    : sent
      ? `Não foi possível enviar o convite por e-mail (${sent.error}). Envie a senha provisória abaixo por um canal seguro.`
      : "Envie a senha provisória abaixo por um canal seguro — ela não será exibida novamente.";
  return { ok: true, message: `${d.name} cadastrado(a). ${how}`, secret };
}

export async function toggleUserStatus(id: string) {
  const me = await requireUser("superadmin", "syndic");
  const u = await db.user.findUnique({ where: { id } });
  if (!u || !canManage(me, u)) return;
  const status = u.status === "active" ? "inactive" : "active";
  await db.user.update({ where: { id }, data: { status } });
  await audit(me, status === "active" ? "activate" : "deactivate", "user", id, { old: { status: u.status }, new: { status }, condominiumId: u.condominiumId });
  revalidatePath("/usuarios");
  revalidatePath("/admin/usuarios");
}

export async function resetPassword(id: string, _prev: AdminState): Promise<AdminState> {
  const me = await requireUser("superadmin", "syndic");
  const u = await db.user.findUnique({ where: { id } });
  if (!u || !canManage(me, u)) return { error: "Ação não permitida." };
  const secret = tempPassword();
  await db.user.update({ where: { id }, data: { passwordHash: await bcrypt.hash(secret, 10), failedLogins: 0, lockedUntil: null } });
  await audit(me, "reset_password", "user", id, { condominiumId: u.condominiumId });
  const sent = await emailAccess(u, secret, "reset");
  return { ok: true, secret, message: sent?.ok ? `Enviada por e-mail para ${u.email}.` : sent ? `E-mail não enviado: ${sent.error}` : undefined };
}

// ───────────────────────────── Condomínios ─────────────────────────────

const condoSchema = z.object({
  name: z.string().trim().min(3, "Nome muito curto"),
  address: z.string().trim().max(200).optional(),
  cnpj: z.string().trim().max(20).optional(),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().email("E-mail inválido").optional(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

const DEFAULT_CATEGORIES: [string, string, string][] = [
  ["Pintura", "paintbrush", "#5B5BD6"], ["Elétrica", "zap", "#F39C12"], ["Hidráulica", "droplets", "#3498DB"],
  ["Limpeza", "sparkles", "#2ECC71"], ["Jardinagem", "leaf", "#27AE60"], ["Serralheria", "hammer", "#8A8A8A"],
];
const DEFAULT_AREAS = ["Hall de entrada", "Salão de festas", "Piscina", "Academia", "Garagem", "Jardim"];

export async function saveCondominium(id: string | null, _: AdminState, form: FormData): Promise<AdminState> {
  const me = await requireUser("superadmin");
  const parsed = condoSchema.safeParse(Object.fromEntries([...form.entries()].filter(([k, v]) => v !== "" && !k.startsWith("$"))));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  if (id) {
    const old = await db.condominium.findUnique({ where: { id } });
    if (!old) return { error: "Condomínio não encontrado." };
    await db.condominium.update({ where: { id }, data: { ...d, address: d.address ?? null, cnpj: d.cnpj ?? null, phone: d.phone ?? null, email: d.email ?? null } });
    await audit(me, "update", "condominium", id, { old, new: d, condominiumId: id });
    revalidatePath(`/admin/condominios/${id}`);
    return { ok: true, message: "Alterações salvas." };
  }

  // Estrutura inicial: torres (andares × unidades) ou quadras (casas/lotes), um agrupamento por linha
  const layout = isLayout(form.get("layout")) ? (form.get("layout") as Layout) : "vertical";
  const houseNoun = layout !== "vertical" && isHouseNoun(form.get("houseNoun")) ? (form.get("houseNoun") as HouseNoun) : "house";
  const groups = String(form.get("buildings") ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
  const floors = Math.min(80, Math.max(0, Number(form.get("floors") ?? 0)));
  const perFloor = Math.min(20, Math.max(0, Number(form.get("perFloor") ?? 0)));
  const houses = Math.min(2000, Math.max(0, Number(form.get("houses") ?? 0)));
  const buildings =
    layout === "horizontal"
      ? (groups.length ? groups : [HOUSE_NOUNS[houseNoun].many]).map((name) => ({
          name,
          kind: "block",
          implicit: !groups.length, // sem quadras: o nome não aparece nos rótulos
          units: { create: houseNumbers(1, houses).map((number) => ({ number, type: houseNoun })) },
        }))
      : (groups.length ? groups : ["Bloco Único"]).map((name) => ({
          name,
          units: { create: Array.from({ length: floors * perFloor }, (_, i) => ({ floor: Math.floor(i / perFloor) + 1, number: aptNumber(Math.floor(i / perFloor) + 1, (i % perFloor) + 1) })) },
        }));

  let slug = slugify(d.name);
  if (await db.condominium.findUnique({ where: { slug } })) slug = `${slug}-${randomBytes(2).toString("hex")}`;

  const condo = await db.condominium.create({
    data: {
      ...d, slug,
      categories: { create: DEFAULT_CATEGORIES.map(([name, icon, color]) => ({ name, icon, color })) },
      commonAreas: { create: DEFAULT_AREAS.map((name) => ({ name })) },
      layout,
      houseNoun,
      buildings: { create: buildings },
    },
  });
  await audit(me, "create", "condominium", condo.id, { new: d, condominiumId: condo.id });
  redirect(`/admin/condominios/${condo.id}`);
}

export async function toggleCondominium(id: string) {
  const me = await requireUser("superadmin");
  const c = await db.condominium.findUnique({ where: { id } });
  if (!c) return;
  await db.condominium.update({ where: { id }, data: { active: !c.active } });
  await audit(me, c.active ? "deactivate" : "activate", "condominium", id, { condominiumId: id });
  revalidatePath("/admin/condominios");
  revalidatePath(`/admin/condominios/${id}`);
}

// ───────────────────────────── Exclusão de usuários inativos ─────────────────────────────

/**
 * Exclui o usuário do banco. O histórico (OS, fotos, linha do tempo,
 * comunicados) é preservado: as referências ficam nulas (ON DELETE SET NULL)
 * e aparecem como "Usuário excluído". Unidades, biometria e notificações são
 * apagadas junto (cascade).
 */
async function removeUser(me: CurrentUser, u: { id: string; name: string; role: string; condominiumId: string | null }) {
  await db.user.delete({ where: { id: u.id } });
  await audit(me, "user_deleted", "user", u.id, { old: { name: u.name, role: u.role }, condominiumId: u.condominiumId });
}

async function checkRemovable(me: CurrentUser, u: { id: string; role: string; status: string; condominiumId: string | null; email: string }) {
  if (!canManage(me, u)) return "Você não pode excluir este usuário.";
  if (u.status !== "inactive") return "Desative o acesso antes de excluir.";
  if (u.role === "superadmin" && (await db.user.count({ where: { role: "superadmin", status: "active" } })) < 1) return "O sistema precisa de ao menos um superadmin ativo.";
  return null;
}

export async function deleteUser(id: string, _prev: AdminState): Promise<AdminState> {
  const me = await requireUser("superadmin", "syndic");
  const u = await db.user.findUnique({ where: { id } });
  if (!u) return { error: "Usuário não encontrado." };
  const blocked = await checkRemovable(me, u);
  if (blocked) return { error: blocked };
  await removeUser(me, u);
  revalidatePath("/usuarios");
  revalidatePath("/admin/usuarios");
  return { ok: true, message: `${u.name} foi excluído(a).` };
}

/** Exclui todos os inativos que o usuário atual pode gerenciar. */
export async function deleteInactiveUsers(_prev: AdminState, form: FormData): Promise<AdminState> {
  const me = await requireUser("superadmin", "syndic");
  if (String(form.get("confirm") ?? "").trim().toUpperCase() !== "EXCLUIR") return { error: "Digite EXCLUIR para confirmar." };
  const candidates = await db.user.findMany({
    where: {
      status: "inactive",
      NOT: { id: me.id },
      ...(me.role === "syndic" ? { condominiumId: me.condominiumId, role: { in: MANAGEABLE_ROLES.syndic } } : {}),
    },
  });
  let deleted = 0;
  for (const u of candidates) {
    if (await checkRemovable(me, u)) continue;
    await removeUser(me, u);
    deleted++;
  }
  revalidatePath("/usuarios");
  revalidatePath("/admin/usuarios");
  return { ok: true, message: deleted ? `${deleted} usuário(s) excluído(s).` : "Nenhum usuário inativo para excluir." };
}

// ───────────────────────────── Edição de usuário ─────────────────────────────

const editUserSchema = userSchema.extend({ status: z.enum(["active", "inactive"]) });

export async function updateUser(id: string, _prev: AdminState, form: FormData): Promise<AdminState> {
  const me = await requireUser("superadmin", "syndic");
  const u = await db.user.findUnique({ where: { id }, include: { units: true } });
  if (!u) return { error: "Usuário não encontrado." };
  // O superadmin pode editar os próprios dados; perfil, status e condomínio ficam como estão
  const self = u.id === me.id && me.role === "superadmin";
  if (!self && !canManage(me, u)) return { error: "Você não pode editar este usuário." };

  const parsed = editUserSchema.safeParse(Object.fromEntries([...form.entries()].filter(([, v]) => v !== "")));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = self ? { ...parsed.data, role: u.role as Role, status: u.status as "active" | "inactive", condominiumId: u.condominiumId ?? undefined } : parsed.data;
  if (!MANAGEABLE_ROLES[me.role].includes(d.role)) return { error: "Você não pode atribuir esse perfil." };

  // Síndico não troca o condomínio; superadmin não tem condomínio
  const condominiumId = d.role === "superadmin" ? null : me.role === "superadmin" ? d.condominiumId ?? null : me.condominiumId;
  if (d.role !== "superadmin" && !condominiumId) return { error: "Selecione o condomínio." };
  if (d.email !== u.email && (await db.user.findUnique({ where: { email: d.email } }))) return { error: "Já existe um usuário com este e-mail." };
  const livesInUnit = d.role === "council" || d.role === "resident";
  if (livesInUnit && d.unitId && !(await db.unit.findFirst({ where: { id: d.unitId, building: { condominiumId: condominiumId! } } }))) {
    return { error: "Unidade inválida para este condomínio." };
  }
  // O sistema precisa manter ao menos um superadmin ativo
  if (u.role === "superadmin" && (d.role !== "superadmin" || d.status !== "active")) {
    const others = await db.user.count({ where: { role: "superadmin", status: "active", NOT: { id: u.id } } });
    if (!others) return { error: "O sistema precisa de ao menos um superadmin ativo." };
  }

  const data = {
    name: d.name,
    email: d.email,
    role: d.role,
    phone: d.phone ?? null,
    cpf: d.cpf ?? null,
    company: d.role === "provider" ? d.company ?? null : null,
    specialty: d.role === "provider" ? d.specialty ?? null : null,
    condominiumId,
    status: d.status,
    ...(d.status === "active" && u.status !== "active" ? { failedLogins: 0, lockedUntil: null } : {}),
  };
  const currentUnit = u.units[0];
  const unitChanged = (livesInUnit ? d.unitId ?? null : null) !== (currentUnit?.unitId ?? null) || (livesInUnit && d.unitId && (d.unitRole ?? "owner") !== currentUnit?.role);

  await db.$transaction([
    db.user.update({ where: { id }, data }),
    // Vínculo com unidade: só conselho/morador; troca de condomínio ou perfil limpa
    ...(unitChanged || condominiumId !== u.condominiumId
      ? [
          db.userUnit.deleteMany({ where: { userId: id } }),
          ...(livesInUnit && d.unitId ? [db.userUnit.create({ data: { userId: id, unitId: d.unitId, role: d.unitRole ?? "owner" } })] : []),
        ]
      : []),
  ]);

  const before = { name: u.name, email: u.email, role: u.role, phone: u.phone, cpf: u.cpf, company: u.company, specialty: u.specialty, condominiumId: u.condominiumId, status: u.status, unitId: currentUnit?.unitId ?? null };
  const after = { ...data, unitId: livesInUnit ? d.unitId ?? null : null };
  const changed = (Object.keys(before) as (keyof typeof before)[]).filter((k) => String(before[k] ?? "") !== String(after[k as keyof typeof after] ?? ""));
  if (data.email !== u.email) await sendEmailChangedNotice(u, u.email, data.email, me.name);
  if (changed.length) {
    await audit(me, "update", "user", id, {
      old: Object.fromEntries(changed.map((k) => [k, before[k]])),
      new: Object.fromEntries(changed.map((k) => [k, after[k as keyof typeof after]])),
      condominiumId: condominiumId ?? u.condominiumId,
    });
  }
  revalidatePath("/usuarios");
  revalidatePath("/admin/usuarios");
  return { ok: true, message: changed.length ? "Alterações salvas." : "Nenhuma alteração." };
}
