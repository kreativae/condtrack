-- DropForeignKey
ALTER TABLE "Announcement" DROP CONSTRAINT "Announcement_authorId_fkey";

-- DropForeignKey
ALTER TABLE "ServiceEvent" DROP CONSTRAINT "ServiceEvent_userId_fkey";

-- DropForeignKey
ALTER TABLE "ServiceMedia" DROP CONSTRAINT "ServiceMedia_uploadedById_fkey";

-- DropForeignKey
ALTER TABLE "ServiceOrder" DROP CONSTRAINT "ServiceOrder_requestedById_fkey";

-- AlterTable
ALTER TABLE "Announcement" ALTER COLUMN "authorId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ServiceEvent" ALTER COLUMN "userId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ServiceMedia" ALTER COLUMN "uploadedById" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ServiceOrder" ALTER COLUMN "requestedById" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceMedia" ADD CONSTRAINT "ServiceMedia_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceEvent" ADD CONSTRAINT "ServiceEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Exclui de vez os usuários que tinham sido apenas anonimizados antes desta
-- mudança (e-mail "removido-…@removido.invalid"). As referências no histórico
-- ficam nulas (SET NULL) e aparecem como "Usuário excluído".
DELETE FROM "User" WHERE "email" LIKE 'removido-%@removido.invalid';
