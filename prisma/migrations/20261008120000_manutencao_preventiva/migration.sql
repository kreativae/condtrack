-- Manutenção preventiva: serviços recorrentes (geram OS) e vencimento de documentos
CREATE TABLE "MaintenancePlan" (
    "id" TEXT NOT NULL,
    "condominiumId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'service',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "categoryId" TEXT,
    "commonAreaId" TEXT,
    "providerId" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "every" INTEGER NOT NULL DEFAULT 1,
    "unit" TEXT NOT NULL DEFAULT 'month',
    "nextDue" TEXT NOT NULL,
    "leadDays" INTEGER NOT NULL DEFAULT 7,
    "alertedFor" TEXT,
    "lastOrderId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenancePlan_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MaintenancePlan_condominiumId_active_idx" ON "MaintenancePlan"("condominiumId", "active");
CREATE INDEX "MaintenancePlan_active_nextDue_idx" ON "MaintenancePlan"("active", "nextDue");

ALTER TABLE "MaintenancePlan" ADD CONSTRAINT "MaintenancePlan_condominiumId_fkey" FOREIGN KEY ("condominiumId") REFERENCES "Condominium"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaintenancePlan" ADD CONSTRAINT "MaintenancePlan_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ServiceCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MaintenancePlan" ADD CONSTRAINT "MaintenancePlan_commonAreaId_fkey" FOREIGN KEY ("commonAreaId") REFERENCES "CommonArea"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MaintenancePlan" ADD CONSTRAINT "MaintenancePlan_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
