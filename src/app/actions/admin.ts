"use server";

import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { ADMIN_CONDO_COOKIE } from "@/lib/admin-scope";
import { z } from "zod";
import { db } from "@/lib/db";
import { BACKUP_VALID_HOURS, purgeCondominiumData } from "@/lib/condo-purge";
import { requireUser, type CurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { slugify } from "@/lib/format";
import { MANAGEABLE_ROLES, ROLE_LABEL, ROLES, type Role } from "@/lib/roles";
import { emailConfig, renderEmail, sendEmail } from "@/lib/email";
import { appUrl } from "@/lib/url";
import { renderTemplate } from "@/lib/messages-server";
import { sendEmailChangedNotice } from "@/lib/account-email";
import { HOUSE_NOUNS, aptNumber, houseNumbers, isHouseNoun, isLayout, type HouseNoun, type Layout } from "@/lib/units";
import { DEFAULT_CHECKLIST } from "@/lib/checklist";
import { PERMISSION_KEYS, type Permission } from "@/lib/permissions";
import { deleteFile, saveFile } from "@/lib/storage";
import { financeLog } from "@/lib/finance-server";
import { activateMembership, inCondo, setMemberships } from "@/lib/memberships";

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
/**
 * Superadmin gerencia todos. O síndico só quem tem vínculo APENAS com o condomínio dele
 * (quem atende vários prédios — síndico profissional, prestador — é gerenciado pelo superadmin).
 */
async function canManage(me: CurrentUser, target: { id: string }) {
  if (target.id === me.id) return false;
  if (me.role === "superadmin") return true;
  if (me.role !== "syndic" || !me.condominiumId) return false;
  const ms = await db.membership.findMany({ where: { userId: target.id }, select: { condominiumId: true, role: true } });
  return ms.length === 1 && ms[0].condominiumId === me.condominiumId && MANAGEABLE_ROLES.syndic.includes(ms[0].role as Role);
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
  if (condominiumId) await db.membership.create({ data: { userId: user.id, condominiumId, role: d.role } });
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
  if (!u || !(await canManage(me, u))) return;
  const status = u.status === "active" ? "inactive" : "active";
  await db.user.update({ where: { id }, data: { status } });
  await audit(me, status === "active" ? "activate" : "deactivate", "user", id, { old: { status: u.status }, new: { status }, condominiumId: u.condominiumId });
  revalidatePath("/usuarios");
  revalidatePath("/admin/usuarios");
}

export async function resetPassword(id: string, _prev: AdminState): Promise<AdminState> {
  const me = await requireUser("superadmin", "syndic");
  const u = await db.user.findUnique({ where: { id } });
  if (!u || !(await canManage(me, u))) return { error: "Ação não permitida." };
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

    // Edição completa (superadmin): tipo, nomenclatura, logo, checklist, conselho e situação
    const layout = isLayout(form.get("layout")) ? (form.get("layout") as Layout) : (old.layout as Layout);
    const houseNoun = isHouseNoun(form.get("houseNoun")) ? (form.get("houseNoun") as HouseNoun) : (old.houseNoun as HouseNoun);
    const deadline = String(form.get("checklistDeadline") ?? "").trim();
    if (deadline && !/^([01]\d|2[0-3]):[0-5]\d$/.test(deadline)) return { error: "Horário limite inválido (use HH:MM)." };
    const councilFinanceAccess = form.get("councilFinanceAccess") === "on";
    const active = form.get("active") === "on";

    let logoUrl = old.logoUrl;
    const logo = form.get("logo");
    if (logo instanceof File && logo.size > 0) {
      if (!["image/png", "image/jpeg", "image/webp"].includes(logo.type)) return { error: "Logo: use PNG, JPG ou WebP." };
      if (logo.size > 1024 * 1024) return { error: "Logo: até 1 MB." };
      logoUrl = await saveFile(logo, "brand");
    } else if (form.get("removeLogo") === "on") {
      logoUrl = null;
    }

    const data = {
      ...d, address: d.address ?? null, cnpj: d.cnpj ?? null, phone: d.phone ?? null, email: d.email ?? null,
      layout, houseNoun, logoUrl, checklistDeadline: deadline || null, councilFinanceAccess, active,
    };
    await db.$transaction(async (tx) => {
      await tx.condominium.update({ where: { id }, data });
      // Casas ↔ lotes: as unidades das quadras acompanham a nova nomenclatura
      if (houseNoun !== old.houseNoun) {
        await tx.unit.updateMany({ where: { building: { condominiumId: id }, type: { in: ["house", "lot"] } }, data: { type: houseNoun } });
      }
    });
    if (old.logoUrl && old.logoUrl !== logoUrl) await deleteFile(old.logoUrl).catch(() => null);
    if (councilFinanceAccess !== old.councilFinanceAccess) {
      await financeLog(me, { condominiumId: id, action: "council_access", changes: { acesso: councilFinanceAccess ? "liberado" : "retirado", via: "cadastro do condomínio" } });
    }
    await audit(me, "update", "condominium", id, { old, new: data, condominiumId: id });
    revalidatePath("/", "layout");
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
      checklistItems: { create: DEFAULT_CHECKLIST.map((title, i) => ({ title, sortOrder: i + 1 })) },
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
  if (!(await canManage(me, u))) return "Você não pode excluir este usuário.";
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
      ...(me.role === "syndic" ? inCondo(me.condominiumId!, MANAGEABLE_ROLES.syndic) : {}),
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
  if (!self && !(await canManage(me, u))) return { error: "Você não pode editar este usuário." };

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
    // Permissões extras: só o superadmin concede, e só valem para síndico
    permissions:
      d.role !== "syndic" ? "" : me.role === "superadmin" && form.get("permsForm") === "1"
        ? form.getAll("perm").map(String).filter((p): p is Permission => PERMISSION_KEYS.includes(p as Permission)).join(",")
        : u.permissions,
  };
  const currentUnit = u.units[0];
  const unitChanged = (livesInUnit ? d.unitId ?? null : null) !== (currentUnit?.unitId ?? null) || (livesInUnit && d.unitId && (d.unitRole ?? "owner") !== currentUnit?.role);

  // Outros condomínios (vínculos extras): só o superadmin define
  let extras: { condominiumId: string; role: string; permissions: string }[] | null = null;
  if (me.role === "superadmin" && !self && form.get("membershipsForm") === "1") {
    try {
      const raw = JSON.parse(String(form.get("memberships") ?? "[]")) as { condominiumId?: unknown; role?: unknown; permissions?: unknown }[];
      const condoIds = new Set((await db.condominium.findMany({ where: { deletedAt: null }, select: { id: true } })).map((c) => c.id));
      extras = raw
        .filter((m) => typeof m.condominiumId === "string" && condoIds.has(m.condominiumId) && m.condominiumId !== condominiumId && typeof m.role === "string" && (ROLES as readonly string[]).includes(m.role) && m.role !== "superadmin")
        .map((m) => ({
          condominiumId: m.condominiumId as string,
          role: m.role as string,
          permissions: m.role === "syndic" && typeof m.permissions === "string" ? m.permissions.split(",").filter((p) => PERMISSION_KEYS.includes(p as Permission)).join(",") : "",
        }));
    } catch {
      return { error: "Vínculos inválidos." };
    }
  }

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

  // Vínculos: o condomínio/perfil do formulário é o vínculo principal (ativo); superadmin não tem vínculos
  if (data.role === "superadmin") await db.membership.deleteMany({ where: { userId: id } });
  else if (condominiumId) {
    const others = extras ?? (await db.membership.findMany({ where: { userId: id, condominiumId: { not: condominiumId } }, select: { condominiumId: true, role: true, permissions: true } }));
    await setMemberships(id, [{ condominiumId, role: data.role, permissions: data.permissions }, ...others], condominiumId);
  }

  const before = { name: u.name, email: u.email, role: u.role, phone: u.phone, cpf: u.cpf, company: u.company, specialty: u.specialty, condominiumId: u.condominiumId, status: u.status, permissions: u.permissions, unitId: currentUnit?.unitId ?? null };
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

// ───── Síndicos do condomínio (superadmin)

/** Torna síndico deste condomínio a pessoa do e-mail (cria o vínculo ou troca o perfil do vínculo existente). */
export async function assignSyndic(condominiumId: string, _: AdminState, form: FormData): Promise<AdminState> {
  const me = await requireUser("superadmin");
  const parsed = z.string().trim().toLowerCase().email().safeParse(form.get("email"));
  if (!parsed.success) return { error: "Informe um e-mail válido." };
  const u = await db.user.findUnique({ where: { email: parsed.data }, include: { memberships: { where: { condominiumId } } } });
  if (!u) return { error: "Nenhum usuário com esse e-mail. Cadastre a pessoa antes em Usuários." };
  if (u.role === "superadmin") return { error: "O superadmin já vê todos os condomínios." };
  const before = u.memberships[0]?.role ?? null;
  if (before === "syndic") return { error: `${u.name} já é síndico deste condomínio.` };
  await db.membership.upsert({
    where: { userId_condominiumId: { userId: u.id, condominiumId } },
    create: { userId: u.id, condominiumId, role: "syndic" },
    update: { role: "syndic" },
  });
  // Sem condomínio ativo (ou com este ativo): passa a usar o vínculo de síndico
  if (!u.condominiumId || u.condominiumId === condominiumId) await activateMembership(u.id, condominiumId);
  await audit(me, "assign_syndic", "user", u.id, { old: { perfil: before }, new: { perfil: "syndic" }, condominiumId });
  revalidatePath(`/admin/condominios/${condominiumId}`);
  return { ok: true, message: `${u.name} agora é síndico deste condomínio.` };
}

/** Tira o vínculo de síndico deste condomínio (a conta continua; se era o condomínio ativo, passa para outro vínculo). */
export async function removeSyndic(condominiumId: string, userId: string) {
  const me = await requireUser("superadmin");
  const m = await db.membership.findUnique({ where: { userId_condominiumId: { userId, condominiumId } } });
  if (!m || m.role !== "syndic") return;
  await db.membership.delete({ where: { id: m.id } });
  const u = await db.user.findUnique({ where: { id: userId }, select: { condominiumId: true } });
  if (u?.condominiumId === condominiumId) {
    const other = await db.membership.findFirst({ where: { userId, condominiumId: { not: condominiumId } }, orderBy: { createdAt: "asc" } });
    if (other) await activateMembership(userId, other.condominiumId);
    else await db.user.update({ where: { id: userId }, data: { condominiumId: null, permissions: "" } });
  }
  await audit(me, "remove_syndic", "user", userId, { old: { perfil: "syndic" }, condominiumId });
  revalidatePath(`/admin/condominios/${condominiumId}`);
}

// ───── Excluir (arquivar) e restaurar condomínio (superadmin)

const BILLING_OPEN = ["trialing", "active", "past_due", "unpaid", "paused"];

/**
 * "Excluir" um condomínio real = arquivar: some da plataforma, mas OS, financeiro, assembleias e histórico
 * ficam guardados (regra do financeiro: nada é apagado). Quem só tinha este condomínio é desativado.
 */
export async function archiveCondominium(id: string, _: AdminState, form: FormData): Promise<AdminState> {
  const me = await requireUser("superadmin");
  const c = await db.condominium.findUnique({ where: { id }, include: { subscription: true } });
  if (!c || c.deletedAt) return { error: "Condomínio não encontrado." };
  if (c.demo) return { error: "Demonstrações são apagadas em Excluir demonstração." };
  const typed = String(form.get("confirm") ?? "").trim().toLowerCase();
  if (typed !== c.name.trim().toLowerCase()) return { error: "Digite o nome do condomínio exatamente como aparece para confirmar." };
  if (c.subscription && BILLING_OPEN.includes(c.subscription.status) && c.subscription.stripeSubscriptionId) {
    return { error: "A assinatura deste condomínio ainda está ativa. Cancele em Assinaturas antes de excluir." };
  }
  const reason = String(form.get("reason") ?? "").trim().slice(0, 500);

  // Quem está com este condomínio ativo: passa para outro vínculo; sem outro, fica desativado (volta ao restaurar)
  const people = await db.user.findMany({ where: { condominiumId: id, role: { not: "superadmin" } }, select: { id: true, status: true } });
  const disabled: string[] = [];
  for (const u of people) {
    const other = await db.membership.findFirst({ where: { userId: u.id, condominiumId: { not: id }, condominium: { deletedAt: null } }, orderBy: { createdAt: "asc" } });
    if (other) await activateMembership(u.id, other.condominiumId);
    else if (u.status === "active") {
      await db.user.update({ where: { id: u.id }, data: { status: "inactive" } });
      disabled.push(u.id);
    }
  }
  await db.condominium.update({ where: { id }, data: { deletedAt: new Date(), deletedBy: me.name, active: false, archivedUserIds: disabled.join(",") } });
  await audit(me, "archive", "condominium", id, { old: { nome: c.name }, new: { motivo: reason || null, pessoasDesativadas: disabled.length }, condominiumId: id });

  const jar = await cookies();
  if (jar.get(ADMIN_CONDO_COOKIE)?.value === id) jar.delete(ADMIN_CONDO_COOKIE);
  revalidatePath("/", "layout");
  redirect("/admin/condominios");
}

/**
 * Exclusão definitiva de um condomínio já arquivado. Exige o backup baixado nas últimas 24 h e o nome digitado.
 * Apaga os dados, os arquivos e as contas que só tinham vínculo com ele; a auditoria guarda o resumo.
 */
export async function purgeCondominium(id: string, _prev: AdminState, form: FormData): Promise<AdminState> {
  const me = await requireUser("superadmin");
  if (me.impersonator) return { error: "Indisponível em modo de visualização." };
  const c = await db.condominium.findUnique({ where: { id }, select: { name: true, deletedAt: true, demo: true } });
  if (!c) return { error: "Condomínio não encontrado." };
  if (!c.deletedAt) return { error: "Exclua (arquive) o condomínio antes da exclusão definitiva." };
  if (String(form.get("confirm") ?? "").trim().toLowerCase() !== c.name.trim().toLowerCase()) return { error: `Digite ${c.name} para confirmar.` };
  const since = new Date(Date.now() - BACKUP_VALID_HOURS * 3600_000);
  const backup = await db.auditLog.findFirst({ where: { action: "backup", entityType: "condominium", entityId: id, createdAt: { gte: since } } });
  if (!backup) return { error: "Baixe o backup antes de excluir de vez." };
  const r = await purgeCondominiumData(id);
  if (!r) return { error: "Condomínio não encontrado." };
  await audit(me, "purge", "condominium", id, {
    old: { condominio: r.name, ordensDeServico: r.orders, contasApagadas: r.deleted, contasDesativadas: r.deactivated, backupEm: backup.createdAt },
    condominiumId: null,
  });
  revalidatePath("/", "layout");
  redirect("/admin/condominios");
}

/** Restaura um condomínio arquivado e reativa quem tinha sido desativado no arquivamento. */
export async function restoreCondominium(id: string) {
  const me = await requireUser("superadmin");
  const c = await db.condominium.findUnique({ where: { id } });
  if (!c?.deletedAt) return;
  const ids = c.archivedUserIds.split(",").filter(Boolean);
  if (ids.length) await db.user.updateMany({ where: { id: { in: ids }, status: "inactive" }, data: { status: "active" } });
  await db.condominium.update({ where: { id }, data: { deletedAt: null, deletedBy: null, active: true, archivedUserIds: "" } });
  await audit(me, "restore", "condominium", id, { new: { pessoasReativadas: ids.length }, condominiumId: id });
  revalidatePath("/", "layout");
  redirect(`/admin/condominios/${id}`);
}
