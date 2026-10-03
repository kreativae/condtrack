-- Condomínio de demonstração (dados fictícios): pode ser excluído pelo superadmin
ALTER TABLE "Condominium" ADD COLUMN "demo" BOOLEAN NOT NULL DEFAULT false;

-- Marca as demonstrações já geradas
UPDATE "Condominium" SET "demo" = true WHERE "slug" LIKE 'vila-das-acacias-%';
