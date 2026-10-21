-- Encomendas recebidas na portaria (local de guarda, retirada e avisos à unidade)
-- CreateTable
CREATE TABLE "Parcel" (
    "id" TEXT NOT NULL,
    "condominiumId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "recipient" TEXT,
    "carrier" TEXT,
    "description" TEXT,
    "volumes" INTEGER NOT NULL DEFAULT 1,
    "location" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'waiting',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedById" TEXT,
    "receivedByName" TEXT NOT NULL,
    "deliveredAt" TIMESTAMP(3),
    "deliveredTo" TEXT,
    "deliveredById" TEXT,
    "deliveredByName" TEXT,

    CONSTRAINT "Parcel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Parcel_condominiumId_status_idx" ON "Parcel"("condominiumId", "status");

-- CreateIndex
CREATE INDEX "Parcel_unitId_status_idx" ON "Parcel"("unitId", "status");

-- AddForeignKey
ALTER TABLE "Parcel" ADD CONSTRAINT "Parcel_condominiumId_fkey" FOREIGN KEY ("condominiumId") REFERENCES "Condominium"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Parcel" ADD CONSTRAINT "Parcel_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

