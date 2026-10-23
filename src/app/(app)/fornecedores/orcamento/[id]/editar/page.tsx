import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { centsToInput, dateToDay } from "@/lib/finance";
import { SUPPLIER_ROLES, canChangeQuote } from "@/lib/suppliers";
import { loadQuoteFor } from "@/lib/suppliers-server";
import { saveQuote } from "@/app/actions/suppliers";
import { Card, PageHeader } from "@/components/ui";
import { QuoteForm } from "../../../quote-form";
import { usedQuoteTitles } from "../../../options";

export const metadata: Metadata = { title: "Editar orçamento" };

export default async function EditQuotePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(...SUPPLIER_ROLES);
  const { id } = await params;
  const q = await loadQuoteFor(user, id);
  if (!q) notFound();
  if (!canChangeQuote(q, user)) redirect(`/fornecedores/orcamento/${id}`);
  return (
    <div className="mx-auto max-w-3xl animate-in">
      <Link href={`/fornecedores/orcamento/${id}`} className="mb-6 inline-flex items-center gap-2 text-xs font-medium text-muted hover:text-brand"><ArrowLeft className="size-3.5" /> Voltar</Link>
      <PageHeader eyebrow={q.supplier.name} title="Editar orçamento" description="Os arquivos são anexados e tirados na tela do orçamento." />
      <Card className="p-6 sm:p-8">
        <QuoteForm
          action={saveQuote.bind(null, id)}
          suppliers={[]}
          titles={await usedQuoteTitles(q.condominiumId)}
          group={{ id: q.groupId ?? "", title: q.title }}
          initial={{ title: q.title, description: q.description ?? "", amount: centsToInput(q.amountCents), validUntil: dateToDay(q.validUntil), deadline: q.deadline ?? "", paymentTerms: q.paymentTerms ?? "" }}
        />
      </Card>
    </div>
  );
}
