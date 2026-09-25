import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { EditOrderForm } from "./edit-order-form";

export const metadata: Metadata = { title: "Editar OS" };

export default async function EditOrderPage({ params }: PageProps<"/os/[id]/editar">) {
  await requireUser("superadmin");
  const { id } = await params;
  const o = await db.serviceOrder.findUnique({ where: { id }, include: { condominium: { select: { name: true } } } });
  if (!o) notFound();
  const cid = o.condominiumId;
  const [categories, areas, units, providers] = await Promise.all([
    db.serviceCategory.findMany({ where: { condominiumId: cid }, orderBy: { name: "asc" } }),
    db.commonArea.findMany({ where: { condominiumId: cid }, orderBy: { name: "asc" } }),
    db.unit.findMany({ where: { building: { condominiumId: cid } }, include: { building: true }, orderBy: [{ building: { name: "asc" } }, { number: "asc" }] }),
    // Só prestadores ativos — mais o atual da OS, para a seleção não perder o valor
    db.user.findMany({ where: { condominiumId: cid, role: "provider", OR: [{ status: "active" }, { id: o.assignedToId ?? "__none__" }] }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="mx-auto max-w-3xl animate-in">
      <Link href={`/os/${id}`} className="mb-6 inline-flex items-center gap-2 text-xs font-medium text-muted hover:text-brand">
        <ArrowLeft className="size-3.5" /> {o.protocol}
      </Link>
      <PageHeader eyebrow={o.condominium.name} title="Editar ordem de serviço" description={`${o.protocol} · as alterações ficam registradas na linha do tempo e na auditoria.`} />
      <Card className="p-6 sm:p-8">
        <EditOrderForm
          order={{
            id: o.id, title: o.title, description: o.description, categoryId: o.categoryId, priority: o.priority, locationType: o.locationType,
            commonAreaId: o.commonAreaId, unitId: o.unitId, locationNote: o.locationNote, dueDate: o.dueDate?.toISOString().slice(0, 10) ?? null,
            assignedToId: o.assignedToId, status: o.status, serviceReport: o.serviceReport, executionMinutes: o.executionMinutes,
          }}
          categories={categories.map((c) => ({ id: c.id, label: c.name }))}
          areas={areas.map((a) => ({ id: a.id, label: a.name }))}
          units={units.map((u) => ({ id: u.id, label: `${u.building.name} · ${u.number}` }))}
          providers={providers.map((p) => ({ id: p.id, label: `${p.name}${p.company ? ` · ${p.company}` : ""}${p.status !== "active" ? " (inativo)" : ""}` }))}
        />
      </Card>
    </div>
  );
}
