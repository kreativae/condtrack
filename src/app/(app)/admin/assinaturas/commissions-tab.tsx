import Link from "next/link";
import { db } from "@/lib/db";
import { brl } from "@/lib/billing-shared";
import { fmtDate } from "@/lib/format";
import { COMMISSION_STATUS, commissionStatus, partnerKind } from "@/lib/commissions";
import { getCommissionSettings } from "@/lib/commissions-server";
import { CancelCommissionButton, CommissionRulesForm, PayCommissionsForm } from "@/components/billing/partner-forms";
import { Badge, Card, CardHeader, Stat, cx } from "@/components/ui";
import { stickyHead } from "@/components/frozen";

/** Aba Comissões: o que pagar a cada parceiro, o histórico e as regras (editáveis). */
export async function CommissionsTab({ status }: { status: string }) {
  const filter = status in COMMISSION_STATUS ? status : "";
  const yearStart = new Date(new Date().getFullYear(), 0, 1);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const [due, totals, paidMonth, paidYear, history, settings] = await Promise.all([
    db.commission.findMany({ where: { status: "due" }, include: { partner: { select: { id: true, name: true, kind: true, pixKey: true } } }, orderBy: { createdAt: "asc" } }),
    db.commission.groupBy({ by: ["status"], _sum: { amountCents: true } }),
    db.commission.aggregate({ where: { status: "paid", paidAt: { gte: monthStart } }, _sum: { amountCents: true } }),
    db.commission.aggregate({ where: { status: "paid", paidAt: { gte: yearStart } }, _sum: { amountCents: true } }),
    db.commission.findMany({
      where: filter ? { status: filter } : {},
      include: { partner: { select: { id: true, name: true } }, condominium: { select: { name: true } }, payment: { select: { paidAt: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    getCommissionSettings(),
  ]);
  const total = (st: string) => totals.find((t) => t.status === st)?._sum.amountCents ?? 0;
  // A pagar, agrupado por parceiro
  const byPartner = Object.values(
    due.reduce<Record<string, { partner: (typeof due)[number]["partner"]; cents: number; count: number }>>((acc, c) => {
      const g = (acc[c.partnerId] ??= { partner: c.partner, cents: 0, count: 0 });
      g.cents += c.amountCents;
      g.count++;
      return acc;
    }, {}),
  ).sort((a, b) => b.cents - a.cents);

  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="A pagar agora" value={brl(total("due"))} tone={total("due") ? "warn" : undefined} />
        <Stat label="Em carência" value={brl(total("pending"))} hint={`liberam no ${settings.holdPayments}º pagamento`} />
        <Stat label="Pago este mês" value={brl(paidMonth._sum.amountCents ?? 0)} tone="ok" />
        <Stat label={`Pago em ${new Date().getFullYear()}`} value={brl(paidYear._sum.amountCents ?? 0)} />
      </div>

      {/* Esquerda: o que pagar e o histórico; direita: as regras, fixas ao rolar */}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader title="A pagar por parceiro" subtitle="Pague por Pix e registre o comprovante." />
            {byPartner.length ? (
              <ul className="divide-y divide-line">
                {byPartner.map((g) => (
                  <li key={g.partner.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <span className="min-w-0 flex-1">
                      <Link href={`/admin/assinaturas/parceiros/${g.partner.id}`} className="block truncate font-medium hover:text-brand">{g.partner.name}</Link>
                      <span className="block text-xs text-muted">{partnerKind(g.partner.kind).label} · {g.count} comissão(ões) · Pix: {g.partner.pixKey ?? "não informado"}</span>
                    </span>
                    <PayCommissionsForm partnerId={g.partner.id} total={brl(g.cents)} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-4 text-sm text-muted">Nada a pagar agora.</p>
            )}
          </Card>

          <Card className="overflow-hidden">
            <CardHeader
              title="Histórico"
              subtitle="Uma comissão por fatura paga, as 100 mais recentes."
              action={
                <div className="flex flex-wrap gap-1 text-xs">
                  {[["", "Todas"], ...Object.entries(COMMISSION_STATUS).map(([k, v]) => [k, v.label])].map(([k, l]) => (
                    <Link key={k} href={`/admin/assinaturas?aba=comissoes${k ? `&status=${k}` : ""}`} className={cx("rounded-full px-2.5 py-1 ring-1", filter === k ? "bg-brand-soft text-brand ring-brand" : "text-muted ring-line hover:text-fg")}>{l}</Link>
                  ))}
                </div>
              }
            />
            {history.length ? (
              <div className="max-h-[36rem] overflow-auto overscroll-contain">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className={`${stickyHead} text-left text-xs font-medium text-muted`}>
                    <tr>
                      <th className="px-5 py-3 font-medium">Condomínio e parceiro</th>
                      <th className="px-3 py-3 text-right font-medium">Base</th>
                      <th className="px-3 py-3 text-right font-medium">Comissão</th>
                      <th className="px-5 py-3 font-medium">Situação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {history.map((c) => {
                      const st = commissionStatus(c.status);
                      return (
                        <tr key={c.id} className="align-top">
                          <td className="px-5 py-3">
                            <span className="block font-medium">{c.condominium.name}</span>
                            <span className="block text-xs text-muted">
                              <Link href={`/admin/assinaturas/parceiros/${c.partner.id}`} className="hover:text-brand">{c.partner.name}</Link> · pago em {fmtDate(c.payment.paidAt)}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-right font-num text-xs tabular-nums text-muted">{brl(c.baseCents)}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-right font-num font-semibold tabular-nums">{brl(c.amountCents)}<span className="block text-[11px] font-normal text-muted">{String(c.pct).replace(".", ",")}%{c.phase === "after" ? " · depois do prazo" : ""}</span></td>
                          <td className="px-5 py-3">
                            <Badge tone={st.tone}>{st.label}</Badge>
                            {c.status === "paid" && <p className="mt-1 text-[11px] text-muted">{fmtDate(c.paidAt)} · {c.paidNote}</p>}
                            {c.status === "cancelled" && <p className="mt-1 text-[11px] text-muted">{c.cancelReason}</p>}
                            {(c.status === "pending" || c.status === "due") && <div className="mt-1"><CancelCommissionButton id={c.id} /></div>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="px-5 py-8 text-center text-sm text-muted">Nenhuma comissão {filter ? "nesta situação" : "ainda: elas nascem a cada fatura paga de condomínio com parceiro"}.</p>
            )}
          </Card>
        </div>

        <Card className="xl:sticky xl:top-24">
          <CardHeader title="Regras de comissão" subtitle="Valem para as próximas comissões; as já geradas não mudam. Cada parceiro pode ter regra própria na ficha." />
          <div className="p-5"><CommissionRulesForm settings={settings} /></div>
        </Card>
      </div>
    </>
  );
}
