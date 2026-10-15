-- Portaria: pessoa única (AccessPerson) com várias autorizações (AccessGrant) e entradas com vários destinos.
-- Os cadastros de UnitPerson viram pessoa + autorização; mesmo documento no condomínio = mesma pessoa.

-- CreateTable
CREATE TABLE "AccessPerson" (
    "id" TEXT NOT NULL,
    "condominiumId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "document" TEXT,
    "docKey" TEXT,
    "phone" TEXT,
    "company" TEXT,
    "notes" TEXT,
    "blockedAt" TIMESTAMP(3),
    "blockedReason" TEXT,
    "blockedById" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccessPerson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessGrant" (
    "id" TEXT NOT NULL,
    "condominiumId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "unitId" TEXT,
    "kind" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "weekdays" TEXT NOT NULL DEFAULT '',
    "timeFrom" TEXT,
    "timeTo" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccessGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessEntryUnit" (
    "entryId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,

    CONSTRAINT "AccessEntryUnit_pkey" PRIMARY KEY ("entryId","unitId")
);

-- Copia os cadastros: o primeiro de cada documento representa a pessoa
CREATE TEMP TABLE "_up_rep" AS
SELECT up.*,
       CASE WHEN up.dk IS NULL THEN up.id
            ELSE first_value(up.id) OVER (PARTITION BY up."condominiumId", up.dk ORDER BY up."createdAt", up.id) END AS rep
FROM (
  SELECT u.*, NULLIF(upper(regexp_replace(coalesce(u."document", ''), '[^0-9A-Za-z]', '', 'g')), '') AS dk
  FROM "UnitPerson" u
) up;

INSERT INTO "AccessPerson" ("id", "condominiumId", "name", "document", "docKey", "phone", "company", "createdById", "createdAt", "updatedAt")
SELECT id, "condominiumId", name, document, dk, phone, company, "createdById", "createdAt", "updatedAt"
FROM "_up_rep" WHERE id = rep;

INSERT INTO "AccessGrant" ("id", "condominiumId", "personId", "unitId", "kind", "validUntil", "notes", "createdById", "createdAt", "updatedAt")
SELECT id, "condominiumId", rep, "unitId", kind, "validUntil", notes, "createdById", "createdAt", "updatedAt"
FROM "_up_rep";

-- Entradas apontavam para o cadastro antigo: passam para a pessoa
UPDATE "AccessEntry" e SET "personId" = r.rep FROM "_up_rep" r WHERE e."personId" = r.id;
UPDATE "AccessEntry" SET "personId" = NULL WHERE "personId" IS NOT NULL AND "personId" NOT IN (SELECT id FROM "AccessPerson");

-- Destino das entradas que já existem
INSERT INTO "AccessEntryUnit" ("entryId", "unitId") SELECT id, "unitId" FROM "AccessEntry" WHERE "unitId" IS NOT NULL;

DROP TABLE "_up_rep";

-- DropTable
ALTER TABLE "UnitPerson" DROP CONSTRAINT "UnitPerson_condominiumId_fkey";
ALTER TABLE "UnitPerson" DROP CONSTRAINT "UnitPerson_unitId_fkey";
DROP TABLE "UnitPerson";

-- CreateIndex
CREATE INDEX "AccessPerson_condominiumId_name_idx" ON "AccessPerson"("condominiumId", "name");
CREATE UNIQUE INDEX "AccessPerson_condominiumId_docKey_key" ON "AccessPerson"("condominiumId", "docKey");
CREATE INDEX "AccessGrant_condominiumId_idx" ON "AccessGrant"("condominiumId");
CREATE INDEX "AccessGrant_personId_idx" ON "AccessGrant"("personId");
CREATE INDEX "AccessGrant_unitId_idx" ON "AccessGrant"("unitId");
CREATE INDEX "AccessEntryUnit_unitId_idx" ON "AccessEntryUnit"("unitId");
CREATE INDEX "AccessEntry_personId_idx" ON "AccessEntry"("personId");

-- AddForeignKey
ALTER TABLE "AccessEntry" ADD CONSTRAINT "AccessEntry_personId_fkey" FOREIGN KEY ("personId") REFERENCES "AccessPerson"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AccessPerson" ADD CONSTRAINT "AccessPerson_condominiumId_fkey" FOREIGN KEY ("condominiumId") REFERENCES "Condominium"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccessGrant" ADD CONSTRAINT "AccessGrant_condominiumId_fkey" FOREIGN KEY ("condominiumId") REFERENCES "Condominium"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccessGrant" ADD CONSTRAINT "AccessGrant_personId_fkey" FOREIGN KEY ("personId") REFERENCES "AccessPerson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccessGrant" ADD CONSTRAINT "AccessGrant_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccessEntryUnit" ADD CONSTRAINT "AccessEntryUnit_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "AccessEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccessEntryUnit" ADD CONSTRAINT "AccessEntryUnit_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
