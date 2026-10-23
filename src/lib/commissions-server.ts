import "server-only";
import { db } from "./db";
import { COMMISSION_SETTINGS_KEY, commissionFor, parseCommissionSettings, releasedStatus, ruleFor } from "./commissions";

/** Regras de comissão salvas pelo superadmin (Setting em JSON puro: só percentuais e prazos). */
export async function getCommissionSettings() {
  const row = await db.setting.findUnique({ where: { key: COMMISSION_SETTINGS_KEY } }).catch(() => null);
  return parseCommissionSettings(row?.value);
}

/**
 * Gera as comissões das faturas pagas do condomínio desde o vínculo com o parceiro (uma por fatura; nunca recalcula
 * as que já existem) e libera para "a pagar" as que estavam em carência. Chamado a cada fatura recebida do Stripe e
 * ao vincular um parceiro. Seguro para chamar várias vezes.
 */
export async function syncCommissions(condominiumId: string) {
  const condo = await db.condominium.findUnique({ where: { id: condominiumId }, select: { partnerId: true, partnerLinkedAt: true, partner: true } });
  if (!condo?.partner || !condo.partnerLinkedAt) return 0;
  const settings = await getCommissionSettings();
  const rule = ruleFor(condo.partner, settings);
  const paid = await db.payment.findMany({
    where: { condominiumId, status: "paid", paidAt: { gte: condo.partnerLinkedAt }, amountPaid: { gt: 0 } },
    select: { id: true, amountPaid: true, paidAt: true, commission: { select: { id: true } } },
    orderBy: { paidAt: "asc" },
  });
  if (!paid.length) return 0;
  const firstPaidAt = paid[0].paidAt!;
  const status = releasedStatus(paid.length, settings.holdPayments);
  let created = 0;
  for (const p of paid) {
    if (p.commission) continue;
    const c = commissionFor(p.amountPaid, p.paidAt!, firstPaidAt, rule, settings.deductPct);
    if (!c) continue;
    await db.commission
      .create({ data: { partnerId: condo.partner.id, condominiumId, paymentId: p.id, paidCents: p.amountPaid, ...c, status } })
      .then(() => created++)
      .catch(() => null); // corrida com outro evento da mesma fatura: a outra chamada já criou
  }
  if (status === "due") await db.commission.updateMany({ where: { condominiumId, status: "pending" }, data: { status: "due" } });
  return created;
}
