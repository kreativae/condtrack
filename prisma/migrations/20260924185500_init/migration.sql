-- CreateTable
CREATE TABLE "Condominium" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "address" TEXT,
    "cnpj" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "logoUrl" TEXT,
    "accentColor" TEXT NOT NULL DEFAULT '#5B5BD6',
    "settings" TEXT NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "osCounter" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Condominium_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Building" (
    "id" TEXT NOT NULL,
    "condominiumId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Building_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Unit" (
    "id" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "floor" INTEGER,
    "type" TEXT NOT NULL DEFAULT 'apartment',

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "phone" TEXT,
    "cpf" TEXT,
    "avatarUrl" TEXT,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "company" TEXT,
    "specialty" TEXT,
    "failedLogins" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "condominiumId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserUnit" (
    "userId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'owner',

    CONSTRAINT "UserUnit_pkey" PRIMARY KEY ("userId","unitId")
);

-- CreateTable
CREATE TABLE "ServiceCategory" (
    "id" TEXT NOT NULL,
    "condominiumId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT 'wrench',
    "color" TEXT NOT NULL DEFAULT '#5B5BD6',

    CONSTRAINT "ServiceCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommonArea" (
    "id" TEXT NOT NULL,
    "condominiumId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "capacity" INTEGER,
    "reservable" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CommonArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceOrder" (
    "id" TEXT NOT NULL,
    "protocol" TEXT NOT NULL,
    "condominiumId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "categoryId" TEXT,
    "locationType" TEXT NOT NULL,
    "commonAreaId" TEXT,
    "unitId" TEXT,
    "locationNote" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'open',
    "dueDate" TIMESTAMP(3),
    "requestedById" TEXT NOT NULL,
    "assignedToId" TEXT,
    "validatedById" TEXT,
    "approvedById" TEXT,
    "assignedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "validatedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "executionMinutes" INTEGER,
    "materialsUsed" TEXT NOT NULL DEFAULT '[]',
    "serviceReport" TEXT,
    "rating" INTEGER,
    "ratingComment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceMedia" (
    "id" TEXT NOT NULL,
    "serviceOrderId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceEvent" (
    "id" TEXT NOT NULL,
    "serviceOrderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "condominiumId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "readBy" TEXT NOT NULL DEFAULT '[]',
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "actorId" TEXT,
    "condominiumId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "oldValues" TEXT,
    "newValues" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "maxUnits" INTEGER,
    "monthlyPrice" INTEGER NOT NULL,
    "yearlyPrice" INTEGER NOT NULL,
    "features" TEXT NOT NULL DEFAULT '[]',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "stripeProductId" TEXT,
    "stripeMonthlyPriceId" TEXT,
    "stripeYearlyPriceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "condominiumId" TEXT NOT NULL,
    "planId" TEXT,
    "interval" TEXT NOT NULL DEFAULT 'month',
    "status" TEXT NOT NULL DEFAULT 'incomplete',
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "unitAmount" INTEGER,
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "trialEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "canceledAt" TIMESTAMP(3),
    "paymentMethodBrand" TEXT,
    "paymentMethodLast4" TEXT,
    "hadTrial" BOOLEAN NOT NULL DEFAULT false,
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "condominiumId" TEXT NOT NULL,
    "stripeInvoiceId" TEXT NOT NULL,
    "number" TEXT,
    "status" TEXT NOT NULL,
    "amountDue" INTEGER NOT NULL,
    "amountPaid" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'brl',
    "description" TEXT,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "hostedInvoiceUrl" TEXT,
    "invoicePdf" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StripeEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StripeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Passkey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "publicKey" BYTEA NOT NULL,
    "counter" INTEGER NOT NULL DEFAULT 0,
    "transports" TEXT NOT NULL DEFAULT '[]',
    "deviceType" TEXT,
    "backedUp" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "Passkey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Condominium_slug_key" ON "Condominium"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Unit_buildingId_number_key" ON "Unit"("buildingId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceOrder_protocol_key" ON "ServiceOrder"("protocol");

-- CreateIndex
CREATE INDEX "ServiceOrder_condominiumId_status_idx" ON "ServiceOrder"("condominiumId", "status");

-- CreateIndex
CREATE INDEX "ServiceOrder_assignedToId_status_idx" ON "ServiceOrder"("assignedToId", "status");

-- CreateIndex
CREATE INDEX "Notification_userId_read_idx" ON "Notification"("userId", "read");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Plan_key_key" ON "Plan"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_condominiumId_key" ON "Subscription"("condominiumId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeCustomerId_key" ON "Subscription"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeSubscriptionId_key" ON "Subscription"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "Subscription_status_idx" ON "Subscription"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_stripeInvoiceId_key" ON "Payment"("stripeInvoiceId");

-- CreateIndex
CREATE INDEX "Payment_condominiumId_createdAt_idx" ON "Payment"("condominiumId", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_status_paidAt_idx" ON "Payment"("status", "paidAt");

-- CreateIndex
CREATE INDEX "Passkey_userId_idx" ON "Passkey"("userId");

-- AddForeignKey
ALTER TABLE "Building" ADD CONSTRAINT "Building_condominiumId_fkey" FOREIGN KEY ("condominiumId") REFERENCES "Condominium"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_condominiumId_fkey" FOREIGN KEY ("condominiumId") REFERENCES "Condominium"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserUnit" ADD CONSTRAINT "UserUnit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserUnit" ADD CONSTRAINT "UserUnit_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCategory" ADD CONSTRAINT "ServiceCategory_condominiumId_fkey" FOREIGN KEY ("condominiumId") REFERENCES "Condominium"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommonArea" ADD CONSTRAINT "CommonArea_condominiumId_fkey" FOREIGN KEY ("condominiumId") REFERENCES "Condominium"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_condominiumId_fkey" FOREIGN KEY ("condominiumId") REFERENCES "Condominium"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ServiceCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_commonAreaId_fkey" FOREIGN KEY ("commonAreaId") REFERENCES "CommonArea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_validatedById_fkey" FOREIGN KEY ("validatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceMedia" ADD CONSTRAINT "ServiceMedia_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "ServiceOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceMedia" ADD CONSTRAINT "ServiceMedia_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceEvent" ADD CONSTRAINT "ServiceEvent_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "ServiceOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceEvent" ADD CONSTRAINT "ServiceEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_condominiumId_fkey" FOREIGN KEY ("condominiumId") REFERENCES "Condominium"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_condominiumId_fkey" FOREIGN KEY ("condominiumId") REFERENCES "Condominium"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_condominiumId_fkey" FOREIGN KEY ("condominiumId") REFERENCES "Condominium"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_condominiumId_fkey" FOREIGN KEY ("condominiumId") REFERENCES "Condominium"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Passkey" ADD CONSTRAINT "Passkey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
