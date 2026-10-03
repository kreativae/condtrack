-- Pedidos do superadmin para excluir comunicados (aprovação do síndico)
-- CreateTable
CREATE TABLE "AnnouncementChange" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'delete',
    "reason" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requestedById" TEXT,
    "requestedBy" TEXT NOT NULL,
    "decidedById" TEXT,
    "decidedBy" TEXT,
    "decisionNote" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnnouncementChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnnouncementChange_announcementId_status_idx" ON "AnnouncementChange"("announcementId", "status");

-- AddForeignKey
ALTER TABLE "AnnouncementChange" ADD CONSTRAINT "AnnouncementChange_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
