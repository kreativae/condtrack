-- Listas editáveis de transportadoras e locais de guarda das encomendas
-- AlterTable
ALTER TABLE "Condominium" ADD COLUMN     "parcelCarriers" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "parcelLocations" TEXT[] DEFAULT ARRAY[]::TEXT[];
