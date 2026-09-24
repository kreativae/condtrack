import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { saveCondominium } from "@/app/actions/admin";
import { CondoForm } from "@/components/admin/condo-form";
import { Card, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Novo condomínio" };

export default async function NewCondoPage() {
  await requireUser("superadmin");
  return (
    <div className="mx-auto max-w-2xl animate-in">
      <PageHeader eyebrow="Condomínios" title="Novo condomínio" />
      <Card className="p-6 sm:p-8"><CondoForm action={saveCondominium.bind(null, null)} /></Card>
    </div>
  );
}
