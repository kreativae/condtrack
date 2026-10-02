-- CreateTable
CREATE TABLE "ChecklistNote" (
    "id" TEXT NOT NULL,
    "condominiumId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "text" TEXT NOT NULL DEFAULT '',
    "photos" TEXT NOT NULL DEFAULT '[]',
    "userId" TEXT,
    "userName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChecklistNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChecklistNote_condominiumId_date_idx" ON "ChecklistNote"("condominiumId", "date");

-- AddForeignKey
ALTER TABLE "ChecklistNote" ADD CONSTRAINT "ChecklistNote_condominiumId_fkey" FOREIGN KEY ("condominiumId") REFERENCES "Condominium"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistNote" ADD CONSTRAINT "ChecklistNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
