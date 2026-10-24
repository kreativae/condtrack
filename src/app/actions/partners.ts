"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { COMMISSION_SETTINGS_KEY, PARTNER_KINDS, normalizeCode, parseCommissionSettings, type PartnerKind } from "@/lib/commissions";
import { syncCommissions } from "@/lib/commissions-server";

export type PartnerState = { error?: string; ok?: boolean; id?: string; message?: string } | undefined;
const fail = (error: string): PartnerState => ({ error });

function refresh(partnerId?: string, condoId?: string) {
  revalidatePath("/admin/assinaturas");
  if (partnerId) revalidatePath(`/admin/assinaturas/parceiros/${partnerId}`);
  if (condoId) revalidatePath(`/admin/assinaturas/${condoId}`);
}

/** "20" / "20,5" / "20%" / "12 meses" → número; vazio → null (usa a regra do tipo) */
const toNumber = (v: unknown) => {
  const s = String(v ?? "").replace(/[^\d,.]/g, "").replace(",", ".");
  return s === "" ? null : Number(s);
};
const pct = z.preprocess(toNumber, z.number({ error: "Percentual em número (ex.: 20 ou 12,5)." }).min(0, "Percentual entre 0 e 100.").max(100, "Percentual entre 0 e 100.").nullable());
const months = z.preprocess(toNumber, z.number({ error: "Meses em número (ex.: 12; 0 = sem prazo)." }).int("Meses em número inteiro.").min(0, "Meses entre 0 e 120.").max(120, "Meses entre 0 e 120.").nullable());
const text = (max: number) => z.string().trim().max(max).optional().transform((v) => v || null);

const partnerSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome.").max(120),
  code: z.string(),
  kind: z.enum(Object.keys(PARTNER_KINDS) as [PartnerKind, ...PartnerKind[]]),
  document: text(30),
  email: z.string().trim().max(160).optional().transform((v) => v || null).refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "E-mail inválido."),
  phone: text(40),
  pixKey: text(120),
  notes: text(2000),
  firstPct: pct,
  firstMonths: months,
  afterPct: pct,
});

/** Cria ou edita um parceiro (id vazio = novo). */
export async function savePartner(id: string | null, _: PartnerState, form: FormData): Promise<PartnerState> {
  const user = await requireUser("superadmin");
  const parsed = partnerSchema.safeParse(Object.fromEntries(form.entries()));
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const { code: rawCode, ...d } = parsed.data;
  const code = normalizeCode(rawCode);
  if (!code) return fail("Código com 4 a 16 letras ou números (ex.: JOAO27).");
  const taken = await db.partner.findUnique({ where: { code }, select: { id: true } });
  if (taken && taken.id !== id) return fail(`O código ${code} já é de outro parceiro.`);

  const before = id ? await db.partner.findUnique({ where: { id } }) : null;
  if (id && !before) return fail("Parceiro não encontrado.");
  const p = id ? await db.partner.update({ where: { id }, data: { ...d, code } }) : await db.partner.create({ data: { ...d, code } });
  await audit(user, id ? "update" : "create", "partner", p.id, { old: before ?? undefined, new: { ...d, code } });
  refresh(p.id);
  return { ok: true, id: p.id, message: "Parceiro salvo." };
}

/** Desativa (o código deixa de valer para novos vínculos; comissões já geradas continuam) ou reativa. */
export async function setPartnerActive(id: string, active: boolean) {
  const user = await requireUser("superadmin");
  await db.partner.update({ where: { id }, data: { active } });
  await audit(user, active ? "activate" : "deactivate", "partner", id);
  refresh(id);
}

/** Liga o condomínio ao parceiro (ou desliga, com partnerId vazio). Comissões só dos pagamentos desde `since`. */
async function linkPartner(user: Awaited<ReturnType<typeof requireUser>>, condominiumId: string, partnerId: string | null, sinceRaw: string): Promise<PartnerState> {
  const condo = await db.condominium.findFirst({ where: { id: condominiumId, deletedAt: null }, select: { id: true, partnerId: true } });
  if (!condo) return fail("Condomínio não encontrado.");
  if (partnerId === condo.partnerId) return { ok: true };
  if (partnerId && !(await db.partner.findFirst({ where: { id: partnerId, active: true }, select: { id: true } }))) return fail("Parceiro inativo ou inexistente.");
  // "Desde" opcional: vale para pagamentos a partir dessa data (ex.: venda fechada antes do cadastro do parceiro)
  const since = sinceRaw ? new Date(`${sinceRaw}T00:00:00-03:00`) : new Date();
  if (Number.isNaN(since.getTime())) return fail("Data inválida.");
  await db.condominium.update({ where: { id: condominiumId }, data: { partnerId, partnerLinkedAt: partnerId ? since : null } });
  await audit(user, "partner_link", "condominium", condominiumId, { old: { partnerId: condo.partnerId }, new: { partnerId, since }, condominiumId });
  const created = partnerId ? await syncCommissions(condominiumId) : 0;
  refresh(partnerId ?? undefined, condominiumId);
  if (condo.partnerId) revalidatePath(`/admin/assinaturas/parceiros/${condo.partnerId}`);
  return { ok: true, message: partnerId ? `Parceiro vinculado${created ? `: ${created} comissão(ões) gerada(s) dos pagamentos desde a data escolhida` : ""}.` : "Parceiro desvinculado." };
}

/** Na página de assinatura do condomínio: escolhe o parceiro. */
export async function linkCondoPartner(condominiumId: string, _: PartnerState, form: FormData): Promise<PartnerState> {
  const user = await requireUser("superadmin");
  return linkPartner(user, condominiumId, String(form.get("partnerId") ?? "") || null, String(form.get("since") ?? ""));
}

/** Na ficha do parceiro: escolhe o condomínio (ou, com `unlink`, tira o condomínio dele). */
export async function linkCondoToPartner(partnerId: string, _: PartnerState, form: FormData): Promise<PartnerState> {
  const user = await requireUser("superadmin");
  const condominiumId = String(form.get("condominiumId") ?? "");
  if (!condominiumId) return fail("Escolha o condomínio.");
  return linkPartner(user, condominiumId, form.get("unlink") ? null : partnerId, String(form.get("since") ?? ""));
}

/** Regras de comissão por tipo, carência e desconto da base (Assinaturas → Comissões). Valem para as próximas comissões. */
export async function saveCommissionSettings(_: PartnerState, form: FormData): Promise<PartnerState> {
  const user = await requireUser("superadmin");
  const num = (k: string) => toNumber(form.get(k)) ?? NaN;
  const raw = {
    rules: Object.fromEntries((Object.keys(PARTNER_KINDS) as PartnerKind[]).map((k) => [k, { pct: num(`${k}.pct`), months: num(`${k}.months`), afterPct: num(`${k}.afterPct`) }])),
    holdPayments: num("holdPayments"),
    deductPct: num("deductPct"),
  };
  const settings = parseCommissionSettings(JSON.stringify(raw));
  // O parse devolve o padrão no que estiver fora do lugar: avisa em vez de salvar outra coisa calada
  if (JSON.stringify(settings) !== JSON.stringify(raw)) return fail("Confira os campos: percentuais de 0 a 100, meses e carência em números inteiros.");
  const before = await db.setting.findUnique({ where: { key: COMMISSION_SETTINGS_KEY } });
  await db.setting.upsert({
    where: { key: COMMISSION_SETTINGS_KEY },
    create: { key: COMMISSION_SETTINGS_KEY, value: JSON.stringify(settings), updatedById: user.id },
    update: { value: JSON.stringify(settings), updatedById: user.id },
  });
  await audit(user, "update", "commission_rules", null, { old: before ? JSON.parse(before.value) : null, new: settings });
  refresh();
  return { ok: true, message: "Regras salvas. Valem para as próximas comissões." };
}

/** Marca como pagas as comissões "a pagar" do parceiro (todas, ou as escolhidas), com o comprovante. */
export async function payCommissions(partnerId: string, _: PartnerState, form: FormData): Promise<PartnerState> {
  const user = await requireUser("superadmin");
  const note = String(form.get("note") ?? "").trim().slice(0, 500);
  if (note.length < 3) return fail("Informe o comprovante ou a referência do Pix.");
  const ids = form.getAll("ids").map(String).filter(Boolean);
  const where = { partnerId, status: "due", ...(ids.length && { id: { in: ids } }) };
  const list = await db.commission.findMany({ where, select: { id: true, amountCents: true } });
  if (!list.length) return fail("Nada a pagar para este parceiro.");
  const res = await db.commission.updateMany({ where: { ...where, id: { in: list.map((c) => c.id) } }, data: { status: "paid", paidAt: new Date(), paidByName: user.name, paidNote: note } });
  const total = list.reduce((a, c) => a + c.amountCents, 0);
  await audit(user, "pay", "commission", partnerId, { new: { count: res.count, totalCents: total, note } });
  refresh(partnerId);
  return { ok: true, message: `${res.count} comissão(ões) marcada(s) como paga(s).` };
}

/** Cancela uma comissão que ainda não foi paga (estorno, fatura devolvida, indicação contestada). */
export async function cancelCommission(id: string, _: PartnerState, form: FormData): Promise<PartnerState> {
  const user = await requireUser("superadmin");
  const reason = String(form.get("reason") ?? "").trim().slice(0, 300);
  if (reason.length < 3) return fail("Informe o motivo.");
  const c = await db.commission.findUnique({ where: { id }, select: { partnerId: true, status: true, amountCents: true } });
  if (!c) return fail("Comissão não encontrada.");
  const res = await db.commission.updateMany({ where: { id, status: { in: ["pending", "due"] } }, data: { status: "cancelled", cancelledAt: new Date(), cancelReason: reason } });
  if (!res.count) return fail("Só dá para cancelar comissão em carência ou a pagar.");
  await audit(user, "cancel", "commission", id, { old: { status: c.status, amountCents: c.amountCents }, new: { reason } });
  refresh(c.partnerId);
  return { ok: true };
}

/** O síndico informa o código do parceiro na tela Assinatura (só se o condomínio ainda não tem parceiro). */
export async function applyPartnerCode(_: PartnerState, form: FormData): Promise<PartnerState> {
  const user = await requireUser("syndic");
  const condominiumId = user.condominiumId;
  if (!condominiumId) return fail("Sem condomínio.");
  const code = normalizeCode(String(form.get("code") ?? ""));
  const partner = code ? await db.partner.findFirst({ where: { code, active: true }, select: { id: true, name: true } }) : null;
  if (!partner) return fail("Código não encontrado. Confira com quem te indicou.");
  const res = await db.condominium.updateMany({ where: { id: condominiumId, partnerId: null }, data: { partnerId: partner.id, partnerLinkedAt: new Date() } });
  if (!res.count) return fail("Este condomínio já está ligado a um parceiro.");
  await audit(user, "partner_link", "condominium", condominiumId, { new: { partnerId: partner.id, code }, condominiumId });
  revalidatePath("/assinatura");
  refresh(partner.id, condominiumId);
  return { ok: true, message: `Código aplicado: indicação de ${partner.name}.` };
}
