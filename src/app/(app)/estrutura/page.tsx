import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { STRUCTURE_TABS, StructureManager, type StructureTab } from "@/components/structure/structure-manager";

export const metadata: Metadata = { title: "Estrutura do condomínio" };

export default async function StructurePage({ searchParams }: PageProps<"/estrutura">) {
  const user = await requireUser("syndic");
  const { tab } = await searchParams;
  const current = (STRUCTURE_TABS.find((t) => t.key === tab)?.key ?? "torres") as StructureTab;
  return (
    <div className="animate-in">
      <PageHeader eyebrow={user.condominium?.name} title="Estrutura do condomínio" description="Torres, unidades, áreas comuns e categorias de serviço usadas nas ordens de serviço." />
      <StructureManager condominiumId={user.condominiumId!} basePath="/estrutura" tab={current} />
    </div>
  );
}
