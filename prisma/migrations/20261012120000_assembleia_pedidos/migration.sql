-- Pedidos do superadmin para editar/excluir assembleias publicadas (aprovação do síndico)
-- CreateTable
CREATE TABLE "AssemblyChange" (
    "id" TEXT NOT NULL,
    "assemblyId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" TEXT NOT NULL DEFAULT '{}',
    "reason" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requestedById" TEXT,
    "requestedBy" TEXT NOT NULL,
    "decidedById" TEXT,
    "decidedBy" TEXT,
    "decisionNote" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssemblyChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssemblyChange_assemblyId_status_idx" ON "AssemblyChange"("assemblyId", "status");

-- AddForeignKey
ALTER TABLE "AssemblyChange" ADD CONSTRAINT "AssemblyChange_assemblyId_fkey" FOREIGN KEY ("assemblyId") REFERENCES "Assembly"("id") ON DELETE CASCADE ON UPDATE CASCADE;
