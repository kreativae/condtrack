-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "condominiumId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "permissions" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_condominiumId_key" ON "Membership"("userId", "condominiumId");

-- CreateIndex
CREATE INDEX "Membership_condominiumId_role_idx" ON "Membership"("condominiumId", "role");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_condominiumId_fkey" FOREIGN KEY ("condominiumId") REFERENCES "Condominium"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Cada usuário atual (fora o superadmin) ganha o vínculo com o condomínio que já tem
INSERT INTO "Membership" ("id", "userId", "condominiumId", "role", "permissions")
SELECT 'mb' || substr(md5(random()::text || u."id"), 1, 23), u."id", u."condominiumId", u."role", u."permissions"
FROM "User" u
WHERE u."condominiumId" IS NOT NULL AND u."role" <> 'superadmin';
