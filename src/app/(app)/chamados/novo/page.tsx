import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { myUnits } from "@/lib/booking-server";
import { TICKET_AUTHORS } from "@/lib/tickets";
import { Card, PageHeader } from "@/components/ui";
import { TicketForm } from "./ticket-form";

export const metadata: Metadata = { title: "Abrir chamado" };

export default async function NewTicketPage() {
  const user = await requireUser(...TICKET_AUTHORS);
  const condoId = user.condominiumId ?? "__none__";
  const areas = await db.commonArea.findMany({ where: { condominiumId: condoId }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  return (
    <div className="animate-in">
      <Link href="/chamados" className="mb-6 inline-flex items-center gap-2 text-xs font-medium text-muted hover:text-brand"><ArrowLeft className="size-3.5" /> Chamados</Link>
      <PageHeader eyebrow="Chamados" title="Abrir chamado" description="Conte o problema, a reclamação ou a sugestão. O síndico recebe o aviso e responde por aqui." />
      <Card className="p-5 sm:p-8">
        <TicketForm areas={areas.map((a) => ({ id: a.id, label: a.name }))} units={myUnits(user, condoId)} />
      </Card>
    </div>
  );
}
