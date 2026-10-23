import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { SUPPLIER_ROLES } from "@/lib/suppliers";
import { loadSupplierFor } from "@/lib/suppliers-server";
import { saveSupplier } from "@/app/actions/suppliers";
import { Card, PageHeader } from "@/components/ui";
import { SupplierForm } from "../../supplier-form";
import { usedCategories } from "../../options";

export const metadata: Metadata = { title: "Editar fornecedor" };

export default async function EditSupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(...SUPPLIER_ROLES);
  const { id } = await params;
  const s = await loadSupplierFor(user, id);
  if (!s) notFound();
  return (
    <div className="mx-auto max-w-3xl animate-in">
      <Link href={`/fornecedores/${id}`} className="mb-6 inline-flex items-center gap-2 text-xs font-medium text-muted hover:text-brand"><ArrowLeft className="size-3.5" /> Voltar</Link>
      <PageHeader eyebrow="Fornecedores" title={`Editar ${s.name}`} />
      <Card className="p-6 sm:p-8">
        <SupplierForm
          action={saveSupplier.bind(null, id)}
          categories={await usedCategories(s.condominiumId)}
          initial={{ name: s.name, category: s.category ?? "", contactName: s.contactName ?? "", phone: s.phone ?? "", email: s.email ?? "", document: s.document ?? "", address: s.address ?? "", notes: s.notes ?? "", rating: s.rating }}
        />
      </Card>
    </div>
  );
}
