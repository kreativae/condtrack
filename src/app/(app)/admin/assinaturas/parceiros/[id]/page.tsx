import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2 } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { brl } from "@/lib/billing-shared";
import { fmtDate } from "@/lib/format";
import { commissionStatus, partnerKind, ruleFor, ruleLabel } from "@/lib/commissions";
import { getCommissionSettings } from "@/lib/commissions-server";
import { AddCondoForm, CancelCommissionButton, CopyCode, PartnerActiveButton, PartnerForm, PayCommissionsForm, UnlinkCondoButton } from "@/components/billing/partner-forms";
import { Badge, Card, CardHeader, PageHeader, Stat } from "@/components/ui";
import { stickyHead } from "@/components/frozen";

export const metadata: Metadata = { title: "Parceiro" };

export default async function PartnerPage({ params }: PageProps<"/admin/assinaturas/parceiros/[id]">) {
  await requireUser("superadmin");
  const { id } = await params;
  const p = await db.partner.findUnique({ where: { id } });
  if (!p) notFound();
  const [condos, free, commissions, sums, settings] = await Promise.all([
    db.condominium.findMany({ where: { partnerId: id, deletedAt: null }, select: { id: true, name: true, partnerLinkedAt: true, subscription: { select: { status: true, stripeSubscriptionId: true } } }, orderBy: { name: "asc" } }),
    db.condominium.findMany({ where: { partnerId: null, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.commission.findMany({ where: { partnerId: id }, include: { condominium: { select: { name: true } }, payment: { select: { paidAt: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
    db.commission.groupBy({ by: ["status"], where: { partnerId: id }, _sum: { amountCents: true } }),
    getCommissionSettings(),
  ]);
  const sum = (st: string) => sums.find((x) => x.status === st)?._sum.amountCents ?? 0;
  const rule = ruleFor(p, settings);
  const s = (v: number | null) => (v == null ? "" : String(v).replace(".", ","));

  return (
    <div className="animate-in">
      <Link href="/admin/assinaturas?aba=parceiros" className="mb-6 inline-flex items-center gap-2 text-xs font-medium text-muted hover:text-brand"><ArrowLeft className="size-3.5" /> Parceiros</Link>
      <PageHeader eyebrow={`${partnerKind(p.kind).label}${p.active ? "" : " · inativo"}`} title={p.name} description={<span className="flex flex-wrap items-center gap-2">Código <CopyCode code={p.code} /> · {ruleLabel(rule)}{rule.custom && <Badge tone="info">regra própria</Badge>}</span>} />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Condomínios" value={condos.length} />
        <Stat label="A pagar" value={brl(sum("due"))} tone={sum("due") ? "warn" : undefined} />
        <Stat label="Em carência" value={brl(sum("pending"))} />
        <Stat label="Já pago" value={brl(sum("paid"))} tone="ok" />
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          <Card className="overflow-hidden">
            <CardHeader title="Comissões" subtitle="Uma por fatura paga dos condomínios dele." action={sum("due") > 0 && <PayCommissionsForm partnerId={id} total={brl(sum("due"))} />} />
            <div className="max-h-[28rem] overflow-auto overscroll-contain">
              <table className="w-full min-w-[620px] text-sm">
                <thead className={`${stickyHead} text-left text-xs font-medium text-muted`}>
                  <tr>
                    <th className="px-5 py-3 font-medium">Pagamento</th>
                    <th className="px-5 py-3 font-medium">Condomínio</th>
                    <th className="px-5 py-3 text-right font-medium">Comissão</th>
                    <th className="px-5 py-3 font-medium">Situação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {commissions.map((c) => {
                    const st = commissionStatus(c.status);
                    return (
                      <tr key={c.id}>
                        <td className="whitespace-nowrap px-5 py-3 text-xs">{fmtDate(c.payment.paidAt)}</td>
                        <td className="px-5 py-3 text-xs">{c.condominium.name}</td>
                        <td className="whitespace-nowrap px-5 py-3 text-right font-num font-semibold tabular-nums">{brl(c.amountCents)}<span className="block text-[11px] font-normal text-muted">{String(c.pct).replace(".", ",")}% de {brl(c.baseCents)}</span></td>
                        <td className="px-5 py-3">
                          <Badge tone={st.tone}>{st.label}</Badge>
                          {c.status === "paid" && <p className="mt-1 text-[11px] text-muted">{fmtDate(c.paidAt)} · {c.paidNote}</p>}
                          {c.status === "cancelled" && <p className="mt-1 text-[11px] text-muted">{c.cancelReason}</p>}
                          {(c.status === "pending" || c.status === "due") && <div className="mt-1"><CancelCommissionButton id={c.id} /></div>}
                        </td>
                      </tr>
                    );
                  })}
                  {!commissions.length && <tr><td colSpan={4} className="px-5 py-8 text-center text-muted">As comissões aparecem a cada fatura paga dos condomínios vinculados.</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
          <Card>
            <CardHeader title="Dados do parceiro" />
            <div className="p-5">
              <PartnerForm
                id={id}
                settings={settings}
                initial={{ name: p.name, code: p.code, kind: p.kind, document: p.document ?? "", email: p.email ?? "", phone: p.phone ?? "", pixKey: p.pixKey ?? "", notes: p.notes ?? "", firstPct: s(p.firstPct), firstMonths: s(p.firstMonths), afterPct: s(p.afterPct) }}
              />
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Condomínios" subtitle="Comissão sobre os pagamentos desde a data do vínculo." />
            <ul className="divide-y divide-line">
              {condos.map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-5 py-2.5">
                  <Building2 className="size-4 shrink-0 text-muted" />
                  <span className="min-w-0 flex-1">
                    <Link href={`/admin/assinaturas/${c.id}`} className="block truncate text-sm font-medium hover:text-brand">{c.name}</Link>
                    <span className="block text-xs text-muted">desde {fmtDate(c.partnerLinkedAt)}{c.subscription?.stripeSubscriptionId ? "" : " · sem assinatura"}</span>
                  </span>
                  <UnlinkCondoButton partnerId={id} condominiumId={c.id} />
                </li>
              ))}
              {!condos.length && <li className="px-5 py-4 text-sm text-muted">Nenhum condomínio vinculado.</li>}
            </ul>
            {p.active && <div className="border-t border-line p-5"><AddCondoForm partnerId={id} condos={free} /></div>}
          </Card>
          <Card className="space-y-2 p-5">
            <p className="text-xs font-medium text-muted">Pagamento</p>
            <p className="text-sm">Pix: <span className="font-medium">{p.pixKey ?? "não informado"}</span></p>
            {p.document && <p className="text-sm">CPF/CNPJ: <span className="font-medium">{p.document}</span></p>}
            <p className="pt-1 text-xs text-muted">Pessoa física: pague por RPA com as retenções; empresa: contra nota fiscal.</p>
          </Card>
          <PartnerActiveButton id={id} active={p.active} />
        </div>
      </div>
    </div>
  );
}
