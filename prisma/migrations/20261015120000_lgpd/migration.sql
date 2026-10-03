-- LGPD: aceite dos termos/política e pedido de exclusão da conta
ALTER TABLE "User" ADD COLUMN "termsAcceptedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "termsVersion" TEXT;
ALTER TABLE "User" ADD COLUMN "deletionRequestedAt" TIMESTAMP(3);
