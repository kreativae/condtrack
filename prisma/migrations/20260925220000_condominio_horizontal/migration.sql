-- Condomínios horizontais (casas/lotes) e mistos
ALTER TABLE "Condominium" ADD COLUMN "layout" TEXT NOT NULL DEFAULT 'vertical';
ALTER TABLE "Condominium" ADD COLUMN "houseNoun" TEXT NOT NULL DEFAULT 'house';
ALTER TABLE "Building" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'tower';
ALTER TABLE "Building" ADD COLUMN "implicit" BOOLEAN NOT NULL DEFAULT false;
