"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { CATEGORY_ICONS } from "@/lib/category-icons";
import { UNIT_TYPE_KEYS, aptNumber, defaultKind, houseNumbers, isHouseNoun, isLayout, type GroupKind, unitNoun } from "@/lib/units";

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

// ───────────────────────────── Torres / blocos ─────────────────────────────

const buildingSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome").max(60),
  kind: z.enum(["tower", "block"]).optional(),
  // torre: andares × unidades por andar
  floors: z.coerce.number().int().min(0).max(80).optional(),
  perFloor: z.coerce.number().int().min(0).max(30).optional(),
  // quadra/rua: faixa de casas ou lotes
  houses: z.coerce.number().int().min(0).max(2000).optional(),
  prefix: z.string().trim().max(8).optional(),
});

const rangeSchema = z
  .object({
    from: z.coerce.number().int().min(0).max(9999),
    to: z.coerce.number().int().min(0).max(9999),
    prefix: z.string().trim().max(8).optional(),
    pad: z.string().optional(),
  })
  .refine((x) => x.to >= x.from, "O número final deve ser maior ou igual ao inicial.")
  .refine((x) => x.to - x.from < 2000, "Gere no máximo 2000 de uma vez.");

async function condoLayout(condominiumId: string) {
  return db.condominium.findUniqueOrThrow({ where: { id: condominiumId }, select: { layout: true, houseNoun: true } });
}

export async function createBuilding(condominiumId: string, _prev: StructState, form: FormData): Promise<StructState> {
  try {
    const user = await manager(condominiumId);
    const d = buildingSchema.parse(fields(form));
    const c = await condoLayout(condominiumId);
    // No misto quem escolhe é o formulário; nos outros, o layout manda
    const kind: GroupKind = c.layout === "mixed" ? (d.kind ?? "tower") : defaultKind(c.layout);
    const units =
      kind === "block"
        ? houseNumbers(1, d.houses ?? 0, d.prefix).map((number) => ({ number, type: c.houseNoun }))
        : Array.from({ length: (d.floors ?? 0) * (d.perFloor ?? 0) }, (_, i) => {
            const floor = Math.floor(i / d.perFloor!) + 1;
            return { floor, number: aptNumber(floor, (i % d.perFloor!) + 1) };
          });
    const b = await db.building.create({ data: { condominiumId, name: d.name, kind, units: { create: units } } });
    await audit(user, "create", "building", b.id, { new: { ...d, kind }, condominiumId });
    const noun = kind === "block" ? (c.houseNoun === "lot" ? "lote(s)" : "casa(s)") : "unidade(s)";
    return done(condominiumId, `${d.name} criado${units.length ? ` com ${units.length} ${noun}` : ""}.`);
  } catch (e) {
    return fail(e);
  }
}

/**
 * Tipo do condomínio (vertical/horizontal/misto) e como chamar as unidades
 * horizontais (casa/lote). Ao trocar, ajusta os agrupamentos e as unidades existentes.
 */
export async function saveLayout(condominiumId: string, _prev: StructState, form: FormData): Promise<StructState> {
  try {
    const user = await manager(condominiumId);
    const layout = form.get("layout");
    const houseNoun = form.get("houseNoun") ?? "house";
    if (!isLayout(layout) || !isHouseNoun(houseNoun)) return { error: "Opção inválida." };
    const old = await condoLayout(condominiumId);
    // No vertical o nome casa/lote não se aplica: mantém o que já estava
    const noun = layout === "vertical" ? old.houseNoun : houseNoun;
    if (old.layout === layout && old.houseNoun === noun) return { ok: true, message: "Nada mudou." };
    // Unidades acompanham: apartamento ↔ casa/lote, e casa ↔ lote conforme o nome escolhido
    const unitTypes =
      layout === "vertical"
        ? db.unit.updateMany({ where: { building: { condominiumId }, type: { in: ["house", "lot"] } }, data: { type: "apartment" } })
        : layout === "horizontal"
          ? db.unit.updateMany({ where: { building: { condominiumId }, type: { in: ["apartment", "house", "lot"] } }, data: { type: noun } })
          : db.unit.updateMany({ where: { building: { condominiumId, kind: "block" }, type: { in: ["house", "lot"] } }, data: { type: noun } });
    await db.$transaction([
      db.condominium.update({ where: { id: condominiumId }, data: { layout, houseNoun: noun } }),
      // Vertical/horizontal: todos os agrupamentos passam a ser do mesmo tipo
      ...(layout === "mixed" ? [] : [db.building.updateMany({ where: { condominiumId }, data: { kind: defaultKind(layout), ...(layout === "vertical" && { implicit: false }) } })]),
      unitTypes,
    ]);
    await audit(user, "update", "condominium_layout", condominiumId, { old, new: { layout, houseNoun: noun }, condominiumId });
    revalidatePath("/", "layout"); // os rótulos das unidades mudam em todo o sistema
    return done(condominiumId, "Tipo do condomínio atualizado.");
  } catch (e) {
    return fail(e);
  }
}

export async function renameBuilding(condominiumId: string, id: string, _prev: StructState, form: FormData): Promise<StructState> {
  try {
    const user = await manager(condominiumId);
    const name = z.string().trim().min(1, "Informe o nome").max(60).parse(form.get("name"));
    const old = await db.building.findFirstOrThrow({ where: { id, condominiumId } });
    // "Sem quadras": o nome do agrupamento some dos rótulos (só "Casa 12")
    const implicit = old.kind === "block" && form.get("implicit") === "on";
    await db.building.update({ where: { id }, data: { name, implicit } });
    await audit(user, "update", "building", id, { old: { name: old.name, implicit: old.implicit }, new: { name, implicit }, condominiumId });
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
      return { error: `Não é possível excluir: ${[residents && `${residents} morador(es) vinculado(s)`, orders && `${orders} OS registrada(s)`].filter(Boolean).join(" e ")} nas unidades de ${b.name}.` };
    }
    const total = await db.building.count({ where: { condominiumId } });
    if (total <= 1) return { error: "O condomínio precisa ter ao menos um agrupamento (torre ou quadra)." };
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
  type: z.enum(UNIT_TYPE_KEYS).default("apartment"),
});

async function ownBuilding(condominiumId: string, buildingId: string) {
  return db.building.findFirstOrThrow({ where: { id: buildingId, condominiumId } });
}

export async function createUnit(condominiumId: string, buildingId: string, _prev: StructState, form: FormData): Promise<StructState> {
  try {
    const user = await manager(condominiumId);
    const b = await ownBuilding(condominiumId, buildingId);
    const d = unitSchema.parse(fields(form));
    const u = await db.unit.create({ data: { buildingId, number: d.number, floor: b.kind === "block" ? null : (d.floor ?? null), type: d.type } });
    await audit(user, "create", "unit", u.id, { new: d, condominiumId });
    return done(condominiumId, `${unitNoun({ type: d.type, building: b })} ${d.number} adicionada.`);
  } catch (e) {
    return fail(e);
  }
}

/** Gera várias unidades de uma vez (andares × unidades por andar), ignorando números existentes. */
export async function generateUnits(condominiumId: string, buildingId: string, _prev: StructState, form: FormData): Promise<StructState> {
  try {
    const user = await manager(condominiumId);
    const b = await ownBuilding(condominiumId, buildingId);
    const existing = new Set((await db.unit.findMany({ where: { buildingId }, select: { number: true } })).map((u) => u.number));

    if (b.kind === "block") {
      const r = rangeSchema.parse(fields(form));
      const { houseNoun } = await condoLayout(condominiumId);
      const data = houseNumbers(r.from, r.to, r.prefix, r.pad === "on").filter((n) => !existing.has(n)).map((number) => ({ buildingId, number, type: houseNoun }));
      if (!data.length) return { error: "Todos esses números já existem." };
      await db.unit.createMany({ data });
      await audit(user, "create_many", "unit", buildingId, { new: { ...r, created: data.length }, condominiumId });
      return done(condominiumId, `${data.length} ${houseNoun === "lot" ? "lote(s) criado(s)" : "casa(s) criada(s)"}.`);
    }

    const d = z
      .object({
        fromFloor: z.coerce.number().int().min(0).max(200),
        toFloor: z.coerce.number().int().min(0).max(200),
        perFloor: z.coerce.number().int().min(1, "Informe as unidades por andar").max(30),
      })
      .refine((x) => x.toFloor >= x.fromFloor, "O andar final deve ser maior ou igual ao inicial.")
      .parse(fields(form));
    const data = [];
    for (let f = d.fromFloor; f <= d.toFloor; f++) {
      for (let i = 1; i <= d.perFloor; i++) {
        const number = aptNumber(f, i);
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
    const old = await db.unit.findFirstOrThrow({ where: { id, building: { condominiumId } }, include: { building: true } });
    const d = unitSchema.parse(fields(form));
    await db.unit.update({ where: { id }, data: { number: d.number, floor: old.building.kind === "block" ? null : (d.floor ?? null), type: d.type } });
    await audit(user, "update", "unit", id, { old: { number: old.number, floor: old.floor, type: old.type }, new: d, condominiumId });
    return done(condominiumId, `${unitNoun({ type: d.type, building: old.building })} ${d.number} atualizada.`);
  } catch (e) {
    return fail(e);
  }
}

export async function deleteUnit(condominiumId: string, id: string, _prev: StructState): Promise<StructState> {
  try {
    const user = await manager(condominiumId);
    const u = await db.unit.findFirstOrThrow({ where: { id, building: { condominiumId } }, include: { building: true, _count: { select: { residents: true, orders: true } } } });
    if (u._count.residents || u._count.orders) {
      return { error: `${unitNoun(u)} ${u.number} tem ${[u._count.residents && `${u._count.residents} morador(es)`, u._count.orders && `${u._count.orders} OS`].filter(Boolean).join(" e ")} vinculado(s).` };
    }
    await db.unit.delete({ where: { id } });
    await audit(user, "delete", "unit", id, { old: { number: u.number }, condominiumId });
    return done(condominiumId, `${unitNoun(u)} ${u.number} excluída.`);
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
