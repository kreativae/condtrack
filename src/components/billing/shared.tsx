import { ExternalLink, FileText } from "lucide-react";
import { Badge, Card, Empty } from "@/components/ui";
import { stickyHead } from "@/components/frozen";
import { INVOICE_STATUS, SUB_STATUS, brl } from "@/lib/billing-shared";
import { fmtDate } from "@/lib/format";

export function SubscriptionBadge({ status }: { status: string | null | undefined }) {
  const m = SUB_STATUS[status ?? "none"] ?? SUB_STATUS.none;
  return <Badge tone={m.tone} dot>{m.label}</Badge>;
}

export function InvoiceBadge({ status }: { status: string }) {
  const m = INVOICE_STATUS[status] ?? { label: status, tone: "muted" as const };
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

type Invoice = {
  id: string;
  number: string | null;
  status: string;
  amountDue: number;
  amountPaid: number;
  description: string | null;
  createdAt: Date;
  paidAt: Date | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  hostedInvoiceUrl: string | null;
  invoicePdf: string | null;
  condominium?: { name: string } | null;
};

/** `scroll`: altura máxima com rolagem interna e cabeçalho fixo (listas longas). */
export function InvoiceTable({ invoices, showCondo, scroll }: { invoices: Invoice[]; showCondo?: boolean; scroll?: boolean }) {
  if (!invoices.length) return <Card><Empty icon={<FileText />} title="Nenhuma fatura ainda">As faturas aparecem aqui após a primeira cobrança.</Empty></Card>;
  return (
    <Card className={scroll ? "max-h-[28rem] overflow-auto overscroll-contain" : "overflow-x-auto"}>
      <table className="w-full min-w-[640px] text-sm">
        <thead className={`${stickyHead} text-left text-xs font-medium text-muted`}>
          <tr>
            <th className="px-5 py-3 font-medium">Data</th>
            {showCondo && <th className="px-5 py-3 font-medium">Condomínio</th>}
            <th className="px-5 py-3 font-medium">Período</th>
            <th className="px-5 py-3 text-right font-medium">Valor</th>
            <th className="px-5 py-3 font-medium">Status</th>
            <th className="px-5 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {invoices.map((i) => (
            <tr key={i.id}>
              <td className="whitespace-nowrap px-5 py-3">
                {fmtDate(i.paidAt ?? i.createdAt)}
                {i.number && <p className="text-xs text-muted">{i.number}</p>}
              </td>
              {showCondo && <td className="px-5 py-3">{i.condominium?.name}</td>}
              <td className="whitespace-nowrap px-5 py-3 text-xs text-muted">
                {i.periodStart && i.periodEnd ? `${fmtDate(i.periodStart)} – ${fmtDate(i.periodEnd)}` : "—"}
              </td>
              <td className="whitespace-nowrap px-5 py-3 text-right font-num font-semibold tabular-nums">{brl(i.status === "paid" ? i.amountPaid : i.amountDue)}</td>
              <td className="px-5 py-3"><InvoiceBadge status={i.status} /></td>
              <td className="whitespace-nowrap px-5 py-3 text-right">
                {i.hostedInvoiceUrl && (
                  <a href={i.hostedInvoiceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">
                    {i.status === "open" ? "Pagar" : "Ver"} <ExternalLink className="size-3" />
                  </a>
                )}
                {i.invoicePdf && (
                  <a href={i.invoicePdf} target="_blank" rel="noreferrer" className="ml-3 inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-fg">
                    PDF <FileText className="size-3" />
                  </a>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
