-- Verificação em duas etapas (app autenticador)
ALTER TABLE "User" ADD COLUMN "totpSecret" TEXT;
ALTER TABLE "User" ADD COLUMN "totpEnabledAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "totpLastStep" INTEGER;
ALTER TABLE "User" ADD COLUMN "recoveryCodes" TEXT NOT NULL DEFAULT '';
