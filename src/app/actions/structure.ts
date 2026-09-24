"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { CATEGORY_ICONS } from "@/lib/category-icons";

export type StructState = { error?: string; ok?: boolean; message?: string } | undefined;

/** Superadmin gerencia qualquer condomínio; síndico só o próprio. */
async function manager(condominiumId: string) {
  const user = await requireUser("superadmin", "syndic");
  if (user.role === "syndic" && user.condominiumId !== condominiumId) throw new Error("Sem permissão para este condomínio.");
  return user;
}

function done(condominiumId: string, message: string): StructState {
  revalidatePath("/estrutura");
  revalidatePath(`/admin/condominios/${condominiumId}`);
  revalidatePath(`/admin/condominios/${condominiumId}/estrutura`);
  return { ok: true, message };
}

function fail(e: unknown): StructState {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { error: "Já existe um registro com esse nome/número." };
  if (e instanceof z.ZodError) return { error: e.issues[0].message };
  return { error: e instanceof Error ? e.message : "Erro inesperado." };
}

const fields = (form: FormData) => Object.fromEntries([...form.entries()].filter(([, v]) => v !== ""));
const unitNumber = (floor: number, i: number) => `${floor}${String(i).padStart(2, "0")}`;

// ───────────────────────────── Torres / blocos ─────────────────────────────

const buildingSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome").max(60),
  floors: z.coerce.number().int().min(0).max(80).optional(),
  perFloor: z.coerce.number().int().min(0).max(30).optional(),
});

export async function createBuilding(condominiumId: string, _prev: StructState, form: FormData): Promise<StructState> {
  try {
    const user = await manager(condominiumId);
    const d = buildingSchema.parse(fields(form));
    const floors = d.floors ?? 0;
    const perFloor = d.perFloor ?? 0;
    const b = await db.building.create({
      data: {
        condominiumId,
        name: d.name,
        units: { create: Array.from({ length: floors * perFloor }, (_, i) => ({ floor: Math.floor(i / perFloor) + 1, number: unitNumber(Math.floor(i / perFloor) + 1, (i % perFloor) + 1) })) },
      },
    });
    await audit(user, "create", "building", b.id, { new: d, condominiumId });
    return done(condominiumId, `${d.name} criado${floors * perFloor ? ` com ${floors * perFloor} unidades` : ""}.`);
  } catch (e) {
    return fail(e);
  }
}

export async function renameBuilding(condominiumId: string, id: string, _prev: StructState, form: FormData): Promise<StructState> {
  try {
    const user = await manager(condominiumId);
    const name = z.string().trim().min(1, "Informe o nome").max(60).parse(form.get("name"));
    const old = await db.building.findFirstOrThrow({ where: { id, condominiumId } });
    await db.building.update({ where: { id }, data: { name } });
    await audit(user, "update", "building", id, { old: { name: old.name }, new: { name }, condominiumId });
    return done(condominiumId, "Nome atualizado.");
  } catch (e) {
    return fail(e);
  }
}

export async function deleteBuilding(condominiumId: string, id: string, _prev: StructState): Promise<StructState> {
  try {
    const user = await manager(condominiumId);
    const b = await db.building.findFirstOrThrow({ where: { id, condominiumId }, include: { _count: { select: { units: true } } } });
    const [residents, orders] = await Promise.all([
      db.userUnit.count({ where: { unit: { buildingId: id } } }),
      db.serviceOrder.count({ where: { unit: { buildingId: id } } }),
    ]);
    if (residents || orders) {
      return { error: `Não é possível excluir: ${[residents && `${residents} morador(es) vinculado(s)`, orders && `${orders} OS registrada(s)`].filter(Boolean).join(" e ")} nas unidades desta torre.` };
    }
    const total = await db.building.count({ where: { condominiumId } });
    if (total <= 1) return { error: "O condomínio precisa ter ao menos uma torre/bloco." };
    await db.building.delete({ where: { id } });
    await audit(user, "delete", "building", id, { old: { name: b.name, units: b._count.units }, condominiumId });
    return done(condominiumId, `${b.name} excluído.`);
  } catch (e) {
    return fail(e);
  }
}

// ───────────────────────────── Unidades ─────────────────────────────

const unitSchema = z.object({
  number: z.string().trim().min(1, "Informe o número").max(20),
  floor: z.coerce.number().int().min(-10).max(200).optional(),
  type: z.enum(["apartment", "house", "commercial", "other"]).default("apartment"),
});

async function ownBuilding(condominiumId: string, buildingId: string) {
  return db.building.findFirstOrThrow({ where: { id: buildingId, condominiumId } });
}

export async function createUnit(condominiumId: string, buildingId: string, _prev: StructState, form: FormData): Promise<StructState> {
  try {
    const user = await manager(condominiumId);
    await ownBuilding(condominiumId, buildingId);
    const d = unitSchema.parse(fields(form));
    const u = await db.unit.create({ data: { buildingId, number: d.number, floor: d.floor ?? null, type: d.type } });
    await audit(user, "create", "unit", u.id, { new: d, condominiumId });
    return done(condominiumId, `Unidade ${d.number} criada.`);
  } catch (e) {
    return fail(e);
  }
}

/** Gera várias unidades de uma vez (andares × unidades por andar), ignorando números existentes. */
export async function generateUnits(condominiumId: string, buildingId: string, _prev: StructState, form: FormData): Promise<StructState> {
  try {
    const user = await manager(condominiumId);
    await ownBuilding(condominiumId, buildingId);
    const d = z
      .object({
        fromFloor: z.coerce.number().int().min(0).max(200),
        toFloor: z.coerce.number().int().min(0).max(200),
        perFloor: z.coerce.number().int().min(1, "Informe as unidades por andar").max(30),
      })
      .refine((x) => x.toFloor >= x.fromFloor, "O andar final deve ser maior ou igual ao inicial.")
      .parse(fields(form));
    const existing = new Set((await db.unit.findMany({ where: { buildingId }, select: { number: true } })).map((u) => u.number));
    const data = [];
    for (let f = d.fromFloor; f <= d.toFloor; f++) {
      for (let i = 1; i <= d.perFloor; i++) {
        const number = unitNumber(f, i);
        if (!existing.has(number)) data.push({ buildingId, floor: f, number });
      }
    }
    if (!data.length) return { error: "Todas essas unidades já existem." };
    await db.unit.createMany({ data });
    await audit(user, "create_many", "unit", buildingId, { new: { ...d, created: data.length }, condominiumId });
    return done(condominiumId, `${data.length} unidade(s) criada(s).`);
  } catch (e) {
    return fail(e);
  }
}

export async function updateUnit(condominiumId: string, id: string, _prev: StructState, form: FormData): Promise<StructState> {
  try {
    const user = await manager(condominiumId);
    const old = await db.unit.findFirstOrThrow({ where: { id, building: { condominiumId } } });
    const d = unitSchema.parse(fields(form));
    await db.unit.update({ where: { id }, data: { number: d.number, floor: d.floor ?? null, type: d.type } });
    await audit(user, "update", "unit", id, { old: { number: old.number, floor: old.floor, type: old.type }, new: d, condominiumId });
    return done(condominiumId, "Unidade atualizada.");
  } catch (e) {
    return fail(e);
  }
}

export async function deleteUnit(condominiumId: string, id: string, _prev: StructState): Promise<StructState> {
  try {
    const user = await manager(condominiumId);
    const u = await db.unit.findFirstOrThrow({ where: { id, building: { condominiumId } }, include: { _count: { select: { residents: true, orders: true } } } });
    if (u._count.residents || u._count.orders) {
      return { error: `Unidade ${u.number} tem ${[u._count.residents && `${u._count.residents} morador(es)`, u._count.orders && `${u._count.orders} OS`].filter(Boolean).join(" e ")} vinculado(s).` };
    }
    await db.unit.delete({ where: { id } });
    await audit(user, "delete", "unit", id, { old: { number: u.number }, condominiumId });
    return done(condominiumId, `Unidade ${u.number} excluída.`);
  } catch (e) {
    return fail(e);
  }
}

// ───────────────────────────── Áreas comuns ─────────────────────────────

const areaSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome").max(80),
  description: z.string().trim().max(300).optional(),
  capacity: z.coerce.number().int().min(1).max(10000).optional(),
  reservable: z.literal("on").optional(),
});

export async function saveArea(condominiumId: string, id: string | null, _prev: StructState, form: FormData): Promise<StructState> {
  try {
    const user = await manager(condominiumId);
    const d = areaSchema.parse(fields(form));
    const data = { name: d.name, description: d.description ?? null, capacity: d.capacity ?? null, reservable: d.reservable === "on" };
    if (id) {
      const old = await db.commonArea.findFirstOrThrow({ where: { id, condominiumId } });
      await db.commonArea.update({ where: { id }, data });
      await audit(user, "update", "common_area", id, { old, new: data, condominiumId });
      return done(condominiumId, "Área atualizada.");
    }
    if (await db.commonArea.findFirst({ where: { condominiumId, name: d.name } })) return { error: "Já existe uma área com esse nome." };
    const a = await db.commonArea.create({ data: { ...data, condominiumId } });
    await audit(user, "create", "common_area", a.id, { new: data, condominiumId });
    return done(condominiumId, `${d.name} criada.`);
  } catch (e) {
    return fail(e);
  }
}

export async function deleteArea(condominiumId: string, id: string, _prev: StructState): Promise<StructState> {
  try {
    const user = await manager(condominiumId);
    const a = await db.commonArea.findFirstOrThrow({ where: { id, condominiumId }, include: { _count: { select: { orders: true } } } });
    if (a._count.orders) return { error: `${a.name} tem ${a._count.orders} OS no histórico e não pode ser excluída.` };
    await db.commonArea.delete({ where: { id } });
    await audit(user, "delete", "common_area", id, { old: { name: a.name }, condominiumId });
    return done(condominiumId, `${a.name} excluída.`);
  } catch (e) {
    return fail(e);
  }
}

// ───────────────────────────── Categorias de serviço ─────────────────────────────

const categorySchema = z.object({
  name: z.string().trim().min(2, "Informe o nome").max(60),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida"),
  icon: z.enum(Object.keys(CATEGORY_ICONS) as [string, ...string[]]).default("wrench"),
});

export async function saveCategory(condominiumId: string, id: string | null, _prev: StructState, form: FormData): Promise<StructState> {
  try {
    const user = await manager(condominiumId);
    const d = categorySchema.parse(fields(form));
    const clash = await db.serviceCategory.findFirst({ where: { condominiumId, name: d.name, ...(id ? { NOT: { id } } : {}) } });
    if (clash) return { error: "Já existe uma categoria com esse nome." };
    if (id) {
      const old = await db.serviceCategory.findFirstOrThrow({ where: { id, condominiumId } });
      await db.serviceCategory.update({ where: { id }, data: d });
      await audit(user, "update", "service_category", id, { old, new: d, condominiumId });
      return done(condominiumId, "Categoria atualizada.");
    }
    const c = await db.serviceCategory.create({ data: { ...d, condominiumId } });
    await audit(user, "create", "service_category", c.id, { new: d, condominiumId });
    return done(condominiumId, `${d.name} criada.`);
  } catch (e) {
    return fail(e);
  }
}

export async function deleteCategory(condominiumId: string, id: string, _prev: StructState): Promise<StructState> {
  try {
    const user = await manager(condominiumId);
    const c = await db.serviceCategory.findFirstOrThrow({ where: { id, condominiumId }, include: { _count: { select: { orders: true } } } });
    if (c._count.orders) return { error: `${c.name} está em ${c._count.orders} OS e não pode ser excluída. Renomeie-a se precisar.` };
    await db.serviceCategory.delete({ where: { id } });
    await audit(user, "delete", "service_category", id, { old: { name: c.name }, condominiumId });
    return done(condominiumId, `${c.name} excluída.`);
  } catch (e) {
    return fail(e);
  }
}
