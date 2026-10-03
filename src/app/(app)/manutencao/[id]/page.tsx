import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { deletePlan, savePlan } from "@/app/actions/maintenance";
import { Card, PageHeader } from "@/components/ui";
import { PlanForm } from "../plan-form";
import { planOptions } from "../options";
import { DeletePlanButton } from "./delete-button";

export const metadata: Metadata = { title: "Editar plano de manutenção" };

export default async function EditPlanPage({ params }: PageProps<"/manutencao/[id]">) {
  const user = await requireUser("superadmin", "syndic");
  const p = await db.maintenancePlan.findUnique({ where: { id: (await params).id }, include: { condominium: { select: { name: true } } } });
  if (!p || (user.role !== "superadmin" && p.condominiumId !== user.condominiumId)) notFound();
  const opts = await planOptions(p.condominiumId);
  return (
    <div className="mx-auto max-w-3xl animate-in">
      <Link href="/manutencao" className="mb-6 inline-flex items-center gap-2 text-xs font-medium text-muted hover:text-brand"><ArrowLeft className="size-3.5" /> Voltar</Link>
      <PageHeader eyebrow={p.condominium.name} title="Editar plano" actions={<DeletePlanButton action={deletePlan.bind(null, p.id)} title={p.title} />} />
      <Card className="p-6 sm:p-8">
        <PlanForm action={savePlan.bind(null, p.id)} initial={p} condominiumId={p.condominiumId} {...opts} />
      </Card>
    </div>
  );
}
