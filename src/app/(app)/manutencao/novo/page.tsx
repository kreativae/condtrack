import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { adminScope } from "@/lib/admin-scope-server";
import { savePlan } from "@/app/actions/maintenance";
import { Card, PageHeader } from "@/components/ui";
import { PlanForm } from "../plan-form";
import { planOptions } from "../options";

export const metadata: Metadata = { title: "Novo plano de manutenção" };

export default async function NewPlanPage() {
  const user = await requireUser("superadmin", "syndic");
  const scope = await adminScope(user);
  const condoId = user.role === "superadmin" ? scope?.id : user.condominiumId;
  if (!condoId) redirect("/manutencao");
  const opts = await planOptions(condoId);
  return (
    <div className="mx-auto max-w-3xl animate-in">
      <Link href="/manutencao" className="mb-6 inline-flex items-center gap-2 text-xs font-medium text-muted hover:text-brand"><ArrowLeft className="size-3.5" /> Voltar</Link>
      <PageHeader eyebrow={scope?.name ?? "Manutenção preventiva"} title="Novo plano" />
      <Card className="p-6 sm:p-8">
        <PlanForm action={savePlan.bind(null, null)} condominiumId={condoId} {...opts} />
      </Card>
    </div>
  );
}
