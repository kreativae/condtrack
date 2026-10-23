-- Cotações: orçamentos do mesmo serviço agrupados, com encerramento (contratado) e histórico (arquivadas)
-- CreateTable
CREATE TABLE "QuoteGroup" (
    "id" TEXT NOT NULL,
    "condominiumId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "chosenQuoteId" TEXT,
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "closedByName" TEXT,
    "closingNote" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuoteGroup_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "SupplierQuote" ADD COLUMN "groupId" TEXT;

-- CreateIndex
CREATE INDEX "QuoteGroup_condominiumId_status_archivedAt_idx" ON "QuoteGroup"("condominiumId", "status", "archivedAt");

-- CreateIndex
CREATE INDEX "SupplierQuote_groupId_idx" ON "SupplierQuote"("groupId");

-- AddForeignKey
ALTER TABLE "QuoteGroup" ADD CONSTRAINT "QuoteGroup_condominiumId_fkey" FOREIGN KEY ("condominiumId") REFERENCES "Condominium"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierQuote" ADD CONSTRAINT "SupplierQuote_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "QuoteGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Orçamentos que já existem: uma cotação por serviço (mesmo nome sem acento, caixa ou espaços extras).
-- Tem aprovado = encerrada com ele contratado; nada aguardando = encerrada sem contratação; senão, em andamento.
CREATE TEMP TABLE quote_keys AS
SELECT id, "condominiumId",
       btrim(regexp_replace(translate(lower(title), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn'), '[^a-z0-9]+', ' ', 'g')) AS k
FROM "SupplierQuote";

INSERT INTO "QuoteGroup" ("id", "condominiumId", "title", "status", "chosenQuoteId", "closedAt", "closedByName", "createdByName", "createdAt", "updatedAt")
SELECT 'grp' || substr(md5(q."condominiumId" || '|' || k.k), 1, 22),
       q."condominiumId",
       (array_agg(q.title ORDER BY q."createdAt"))[1],
       CASE WHEN bool_or(q.status = 'pending') AND NOT bool_or(q.status = 'approved') THEN 'open' ELSE 'closed' END,
       CASE WHEN bool_or(q.status = 'pending') AND NOT bool_or(q.status = 'approved') THEN NULL
            ELSE (array_agg(q.id ORDER BY q."decidedAt" DESC NULLS LAST) FILTER (WHERE q.status = 'approved'))[1] END,
       CASE WHEN bool_or(q.status = 'pending') AND NOT bool_or(q.status = 'approved') THEN NULL ELSE max(q."decidedAt") END,
       CASE WHEN bool_or(q.status = 'pending') AND NOT bool_or(q.status = 'approved') THEN NULL
            ELSE (array_agg(q."decidedByName" ORDER BY q."decidedAt" DESC NULLS LAST))[1] END,
       (array_agg(q."createdByName" ORDER BY q."createdAt"))[1],
       min(q."createdAt"),
       CURRENT_TIMESTAMP
FROM "SupplierQuote" q JOIN quote_keys k ON k.id = q.id
GROUP BY q."condominiumId", k.k;

UPDATE "SupplierQuote" q
SET "groupId" = 'grp' || substr(md5(q."condominiumId" || '|' || k.k), 1, 22)
FROM quote_keys k WHERE k.id = q.id;

DROP TABLE quote_keys;
