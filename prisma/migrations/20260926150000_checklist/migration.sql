-- AlterTable
ALTER TABLE "Condominium" ADD COLUMN     "checklistAlertedOn" TEXT,
ADD COLUMN     "checklistDeadline" TEXT;

-- CreateTable
CREATE TABLE "ChecklistItem" (
    "id" TEXT NOT NULL,
    "condominiumId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "commonAreaId" TEXT,
    "frequency" TEXT NOT NULL DEFAULT 'daily',
    "weekdays" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistCheck" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "condominiumId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "note" TEXT,
    "photoUrl" TEXT,
    "userId" TEXT,
    "serviceOrderId" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChecklistCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChecklistItem_condominiumId_active_idx" ON "ChecklistItem"("condominiumId", "active");

-- CreateIndex
CREATE INDEX "ChecklistCheck_condominiumId_date_idx" ON "ChecklistCheck"("condominiumId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ChecklistCheck_itemId_date_key" ON "ChecklistCheck"("itemId", "date");

-- AddForeignKey
ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_condominiumId_fkey" FOREIGN KEY ("condominiumId") REFERENCES "Condominium"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_commonAreaId_fkey" FOREIGN KEY ("commonAreaId") REFERENCES "CommonArea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistCheck" ADD CONSTRAINT "ChecklistCheck_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ChecklistItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistCheck" ADD CONSTRAINT "ChecklistCheck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Checklist inicial (os itens que antes eram fixos no código) para os condomínios existentes
INSERT INTO "ChecklistItem" ("id", "condominiumId", "title", "sortOrder", "updatedAt")
SELECT 'ck' || substr(md5(random()::text || c."id" || i.ord::text), 1, 23), c."id", i.title, i.ord, CURRENT_TIMESTAMP
FROM "Condominium" c
CROSS JOIN (VALUES
  (1, 'Iluminação das áreas comuns'),
  (2, 'Portões e interfones'),
  (3, 'Bombas d’água e reservatórios'),
  (4, 'Limpeza do hall e elevadores'),
  (5, 'Piscina — cloro e pH'),
  (6, 'Extintores e rotas de fuga'),
  (7, 'Garagem — vazamentos e lâmpadas')
) AS i(ord, title);
