-- Saída na portaria (quem está no condomínio agora)
-- AlterTable
ALTER TABLE "AccessEntry" ADD COLUMN     "exitedAt" TIMESTAMP(3),
ADD COLUMN     "exitedById" TEXT;

-- CreateIndex
CREATE INDEX "AccessEntry_condominiumId_exitedAt_idx" ON "AccessEntry"("condominiumId", "exitedAt");
