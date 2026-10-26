-- AlterTable
ALTER TABLE "Condominium" ADD COLUMN     "demoExpiresAt" TIMESTAMP(3),
ADD COLUMN     "demoExpiredNotifiedAt" TIMESTAMP(3),
ADD COLUMN     "demoContactName" TEXT,
ADD COLUMN     "demoContactEmail" TEXT,
ADD COLUMN     "demoContactPhone" TEXT;
