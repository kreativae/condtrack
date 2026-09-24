import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { NewOrderForm } from "./new-order-form";

export const metadata: Metadata = { title: "Nova ordem de serviço" };

export default async function NewOrderPage() {
  const user = await requireUser("superadmin", "syndic", "caretaker", "council");
  const isAdmin = user.role === "superadmin";
  // Superadmin: carrega de todos os condomínios ativos (o form filtra pelo escolhido)
  const scope = isAdmin ? { condominium: { active: true } } : { condominiumId: user.condominiumId ?? "__none__" };

  const [condos, categories, areas, units] = await Promise.all([
    isAdmin ? db.condominium.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [],
    db.serviceCategory.findMany({ where: scope, select: { id: true, name: true, condominiumId: true }, orderBy: { name: "asc" } }),
    db.commonArea.findMany({ where: scope, select: { id: true, name: true, condominiumId: true }, orderBy: { name: "asc" } }),
    user.role === "council"
      ? user.units.map((u) => u.unit)
      : db.unit.findMany({
          where: { building: isAdmin ? { condominium: { active: true } } : { condominiumId: user.condominiumId ?? "__none__" } },
          include: { building: true },
          orderBy: [{ building: { name: "asc" } }, { number: "asc" }],
        }),
  ]);

  const copy = {
    council: ["Nova solicitação", "Relate um problema na sua unidade ou em uma área comum. A administração será notificada imediatamente."],
    caretaker: ["Nova ocorrência", "Registre uma irregularidade encontrada durante a ronda."],
  }[user.role as string] ?? ["Nova ordem de serviço", "Um protocolo será gerado automaticamente."];

  return (
    <div className="mx-auto max-w-3xl animate-in">
      <PageHeader eyebrow="Ordens de serviço" title={copy[0]} description={copy[1]} />
      <Card className="p-6 sm:p-8">
        <NewOrderForm
          role={user.role}
          condos={condos}
          categories={categories}
          areas={areas}
          units={units.map((u) => ({ id: u.id, label: `${u.building.name} · ${u.number}`, condominiumId: u.building.condominiumId }))}
          defaultUnitId={user.units[0]?.unitId}
        />
      </Card>
    </div>
  );
}
