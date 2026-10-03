-- Condomínio arquivado ("excluído" pelo superadmin), com restauração
ALTER TABLE "Condominium" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Condominium" ADD COLUMN "deletedBy" TEXT;
ALTER TABLE "Condominium" ADD COLUMN "archivedUserIds" TEXT NOT NULL DEFAULT '';
