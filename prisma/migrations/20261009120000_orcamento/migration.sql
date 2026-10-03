-- Orçamento anual por categoria (previsto × realizado)
CREATE TABLE "FinanceBudget" (
    "id" TEXT NOT NULL,
    "condominiumId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceBudget_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinanceBudget_condominiumId_year_type_category_key" ON "FinanceBudget"("condominiumId", "year", "type", "category");

ALTER TABLE "FinanceBudget" ADD CONSTRAINT "FinanceBudget_condominiumId_fkey" FOREIGN KEY ("condominiumId") REFERENCES "Condominium"("id") ON DELETE CASCADE ON UPDATE CASCADE;
