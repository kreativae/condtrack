import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { STRUCTURE_TABS, StructureManager, type StructureTab } from "@/components/structure/structure-manager";

export const metadata: Metadata = { title: "Estrutura do condomínio" };

export default async function AdminStructurePage({ params, searchParams }: PageProps<"/admin/condominios/[id]/estrutura">) {
  await requireUser("superadmin");
  const { id } = await params;
  const { tab } = await searchParams;
  const condo = await db.condominium.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!condo) notFound();
  const current = (STRUCTURE_TABS.find((t) => t.key === tab)?.key ?? "torres") as StructureTab;
  return (
    <div className="animate-in">
      <Link href={`/admin/condominios/${id}`} className="mb-6 inline-flex items-center gap-2 text-xs font-medium text-muted hover:text-brand">
        <ArrowLeft className="size-3.5" /> {condo.name}
      </Link>
      <PageHeader eyebrow={condo.name} title="Estrutura do condomínio" description="Torres, unidades, áreas comuns e categorias de serviço." />
      <StructureManager condominiumId={id} basePath={`/admin/condominios/${id}/estrutura`} tab={current} />
    </div>
  );
}
