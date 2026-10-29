import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Alert, Card, PageHeader } from "@/components/ui";
import { NewOrderForm } from "./new-order-form";
import { byUnit, unitLabel } from "@/lib/units";
import { canTicket } from "@/lib/tickets";
import { loadTicketFor } from "@/lib/tickets-server";

export const metadata: Metadata = { title: "Nova ordem de serviço" };

export default async function NewOrderPage({ searchParams }: PageProps<"/os/nova">) {
  const user = await requireUser("superadmin", "syndic", "caretaker", "council");
  // Converter um chamado de morador: a OS já vem preenchida com o que ele escreveu
  const { chamado } = await searchParams;
  const t = typeof chamado === "string" && (user.role === "syndic" || user.role === "superadmin") ? await loadTicketFor(user, chamado) : null;
  const ticket = t && canTicket("convert", t, user) ? t : null;
  const isAdmin = user.role === "superadmin";
  // Superadmin: carrega de todos os condomínios ativos (o form filtra pelo escolhido)
  const scope = isAdmin ? { condominium: { active: true } } : { condominiumId: user.condominiumId ?? "__none__" };

  const [condos, categories, areas, units] = await Promise.all([
    isAdmin ? db.condominium.findMany({ where: { active: true, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [],
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
  }[user.role as string] ?? (ticket ? [`OS do chamado #${ticket.number}`, "Revise o que o morador escreveu, escolha categoria e prioridade. Quem abriu o chamado recebe o aviso e acompanha o andamento."] : ["Nova ordem de serviço", "Um protocolo será gerado automaticamente."]);

  return (
    <div className="animate-in">
      <PageHeader eyebrow="Ordens de serviço" title={copy[0]} description={copy[1]} />
      {typeof chamado === "string" && !ticket && <div className="mb-4"><Alert tone="warn">Este chamado não pode mais virar OS (já foi convertido ou encerrado). Você pode abrir uma OS comum.</Alert></div>}
      {ticket && ticket.photos.length > 0 && <p className="mb-4 text-sm text-muted">As {ticket.photos.length} foto(s) do chamado entram na OS como fotos da abertura.</p>}
      <Card className="p-6 sm:p-8">
        <NewOrderForm
          ticket={ticket ? { id: ticket.id, condominiumId: ticket.condominiumId, title: ticket.title, description: `${ticket.description}\n\nChamado #${ticket.number} aberto por ${ticket.createdByName}.`, locationType: ticket.locationType, commonAreaId: ticket.commonAreaId, unitId: ticket.unitId, locationNote: ticket.locationNote } : undefined}
          role={user.role}
          condos={condos}
          categories={categories}
          areas={areas}
          units={units.sort(byUnit).map((u) => ({ id: u.id, label: unitLabel(u, true), condominiumId: u.building.condominiumId }))}
          defaultUnitId={user.units[0]?.unitId}
        />
      </Card>
    </div>
  );
}
