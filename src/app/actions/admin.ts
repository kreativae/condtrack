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

/** Envia o acesso (senha provisória) por e-mail, se ativado em Configurações → E-mail. */
async function emailAccess(user: { name: string; email: string; role: string }, secret: string, kind: "invite" | "reset") {
  const cfg = await emailConfig();
  if (!cfg.active || !cfg.sendInvites) return null;
  const base = await appUrl();
  const { html, text } = renderEmail({
    title: kind === "invite" ? "Seu acesso ao Condtrack" : "Sua senha foi redefinida",
    intro: `Olá, ${user.name.split(" ")[0]}!`,
    lines:
      kind === "invite"
        ? [`Você foi cadastrado(a) no Condtrack como ${ROLE_LABEL[user.role as Role] ?? user.role}.`, `E-mail: ${user.email}`, `Senha provisória: ${secret}`]
        : ["A administração redefiniu a sua senha de acesso.", `Nova senha provisória: ${secret}`],
    cta: { label: "Entrar no Condtrack", url: `${base}/login` },
    footnote: "Por segurança, altere a senha em Meu perfil após o primeiro acesso. Se você não esperava este e-mail, ignore-o.",
  });
  return sendEmail({ to: user.email, subject: kind === "invite" ? "Seu acesso ao Condtrack" : "Nova senha de acesso — Condtrack", html, text }, cfg);
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

  // Estrutura inicial: torres (uma por linha), andares e unidades por andar
  const buildings = String(form.get("buildings") ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
  const floors = Math.min(80, Math.max(0, Number(form.get("floors") ?? 0)));
  const perFloor = Math.min(20, Math.max(0, Number(form.get("perFloor") ?? 0)));

  let slug = slugify(d.name);
  if (await db.condominium.findUnique({ where: { slug } })) slug = `${slug}-${randomBytes(2).toString("hex")}`;

  const condo = await db.condominium.create({
    data: {
      ...d, slug,
      categories: { create: DEFAULT_CATEGORIES.map(([name, icon, color]) => ({ name, icon, color })) },
      commonAreas: { create: DEFAULT_AREAS.map((name) => ({ name })) },
      buildings: {
        create: (buildings.length ? buildings : ["Bloco Único"]).map((name) => ({
          name,
          units: { create: Array.from({ length: floors * perFloor }, (_, i) => ({ floor: Math.floor(i / perFloor) + 1, number: `${Math.floor(i / perFloor) + 1}${String((i % perFloor) + 1).padStart(2, "0")}` })) },
        })),
      },
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
