import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getCommissionSettings } from "@/lib/commissions-server";
import { PartnerForm } from "@/components/billing/partner-forms";
import { Card, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Novo parceiro" };

export default async function NewPartnerPage() {
  await requireUser("superadmin");
  const settings = await getCommissionSettings();
  return (
    <div className="mx-auto max-w-3xl animate-in">
      <Link href="/admin/assinaturas?aba=parceiros" className="mb-6 inline-flex items-center gap-2 text-xs font-medium text-muted hover:text-brand"><ArrowLeft className="size-3.5" /> Parceiros</Link>
      <PageHeader eyebrow="Assinaturas" title="Novo parceiro" description="Quem vende ou indica o Condtrack. O código vai para o síndico informar na assinatura." />
      <Card className="p-5 sm:p-8"><PartnerForm settings={settings} /></Card>
    </div>
  );
}
