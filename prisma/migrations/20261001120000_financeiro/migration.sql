-- AlterTable
ALTER TABLE "Condominium" ADD COLUMN     "councilFinanceAccess" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "FinanceEntry" (
    "id" TEXT NOT NULL,
    "condominiumId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "counterparty" TEXT,
    "document" TEXT,
    "amountCents" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "paymentMethod" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "FinanceEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceAttachment" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'invoice',
    "url" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedById" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "FinanceAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceLog" (
    "id" TEXT NOT NULL,
    "condominiumId" TEXT NOT NULL,
    "entryId" TEXT,
    "attachmentId" TEXT,
    "userId" TEXT,
    "userName" TEXT NOT NULL,
    "userRole" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "changes" TEXT NOT NULL DEFAULT '{}',
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinanceEntry_condominiumId_date_idx" ON "FinanceEntry"("condominiumId", "date");

-- CreateIndex
CREATE INDEX "FinanceAttachment_entryId_idx" ON "FinanceAttachment"("entryId");

-- CreateIndex
CREATE INDEX "FinanceLog_entryId_createdAt_idx" ON "FinanceLog"("entryId", "createdAt");

-- CreateIndex
CREATE INDEX "FinanceLog_condominiumId_createdAt_idx" ON "FinanceLog"("condominiumId", "createdAt");

-- AddForeignKey
ALTER TABLE "FinanceEntry" ADD CONSTRAINT "FinanceEntry_condominiumId_fkey" FOREIGN KEY ("condominiumId") REFERENCES "Condominium"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceEntry" ADD CONSTRAINT "FinanceEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceEntry" ADD CONSTRAINT "FinanceEntry_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAttachment" ADD CONSTRAINT "FinanceAttachment_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "FinanceEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAttachment" ADD CONSTRAINT "FinanceAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceLog" ADD CONSTRAINT "FinanceLog_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "FinanceEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceLog" ADD CONSTRAINT "FinanceLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
