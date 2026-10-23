import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { adminScope } from "@/lib/admin-scope-server";
import { SUPPLIER_ROLES } from "@/lib/suppliers";
import { supplierCondo } from "@/lib/suppliers-server";
import { saveSupplier } from "@/app/actions/suppliers";
import { Card, PageHeader } from "@/components/ui";
import { SupplierForm } from "../supplier-form";
import { usedCategories } from "../options";

export const metadata: Metadata = { title: "Novo fornecedor" };

export default async function NewSupplierPage() {
  const user = await requireUser(...SUPPLIER_ROLES);
  const condoId = await supplierCondo(user);
  if (!condoId) redirect("/fornecedores");
  const scope = await adminScope(user);
  return (
    <div className="mx-auto max-w-3xl animate-in">
      <Link href="/fornecedores?aba=agenda" className="mb-6 inline-flex items-center gap-2 text-xs font-medium text-muted hover:text-brand"><ArrowLeft className="size-3.5" /> Voltar</Link>
      <PageHeader eyebrow={scope?.name ?? "Fornecedores"} title="Novo fornecedor" />
      <Card className="p-6 sm:p-8">
        <SupplierForm action={saveSupplier.bind(null, null)} categories={await usedCategories(condoId)} />
      </Card>
    </div>
  );
}
