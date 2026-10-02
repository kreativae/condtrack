-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "quantity" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "BillingDeal" (
    "id" TEXT NOT NULL,
    "condominiumId" TEXT NOT NULL,
    "monthlyUnitPrice" INTEGER NOT NULL,
    "yearlyUnitPrice" INTEGER NOT NULL,
    "minUnits" INTEGER NOT NULL DEFAULT 0,
    "trialDays" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "stripeProductId" TEXT,
    "stripeMonthlyPriceId" TEXT,
    "stripeYearlyPriceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingDeal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BillingDeal_condominiumId_key" ON "BillingDeal"("condominiumId");

-- AddForeignKey
ALTER TABLE "BillingDeal" ADD CONSTRAINT "BillingDeal_condominiumId_fkey" FOREIGN KEY ("condominiumId") REFERENCES "Condominium"("id") ON DELETE CASCADE ON UPDATE CASCADE;
