import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { adminScope } from "@/lib/admin-scope-server";
import { SUPPLIER_ROLES } from "@/lib/suppliers";
import { supplierCondo } from "@/lib/suppliers-server";
import { saveQuote } from "@/app/actions/suppliers";
import { Card, PageHeader } from "@/components/ui";
import { QuoteForm } from "../../quote-form";
import { usedQuoteTitles } from "../../options";

export const metadata: Metadata = { title: "Novo orçamento" };

export default async function NewQuotePage({ searchParams }: { searchParams: Promise<{ fornecedor?: string; grupo?: string }> }) {
  const user = await requireUser(...SUPPLIER_ROLES);
  const condoId = await supplierCondo(user);
  if (!condoId) redirect("/fornecedores");
  const [{ fornecedor, grupo }, scope, suppliers, titles] = await Promise.all([
    searchParams,
    adminScope(user),
    db.supplier.findMany({ where: { condominiumId: condoId, archivedAt: null }, select: { id: true, name: true, category: true }, orderBy: { name: "asc" } }),
    usedQuoteTitles(condoId),
  ]);
  // Vindo da cotação: o orçamento entra nela (se ainda estiver aberta)
  const group = grupo ? await db.quoteGroup.findFirst({ where: { id: grupo, condominiumId: condoId, status: "open", archivedAt: null }, select: { id: true, title: true } }) : null;
  return (
    <div className="mx-auto max-w-3xl animate-in">
      <Link href={group ? `/fornecedores/cotacao/${group.id}` : "/fornecedores"} className="mb-6 inline-flex items-center gap-2 text-xs font-medium text-muted hover:text-brand"><ArrowLeft className="size-3.5" /> Voltar</Link>
      <PageHeader eyebrow={scope?.name ?? "Fornecedores"} title="Novo orçamento" description="O síndico recebe o aviso e aprova ou recusa." />
      <Card className="p-6 sm:p-8">
        <QuoteForm
          action={saveQuote.bind(null, null)}
          suppliers={suppliers}
          supplierId={suppliers.some((s) => s.id === fornecedor) ? fornecedor : undefined}
          titles={titles}
          group={group ?? undefined}
          isNew
        />
      </Card>
    </div>
  );
}
