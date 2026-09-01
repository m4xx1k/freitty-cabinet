-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'DISPATCHER', 'DRIVER', 'FLOOR_LEAD');

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('CROSS_DOCK', 'CONSOLIDATION');

-- CreateEnum
CREATE TYPE "Service" AS ENUM ('STORAGE', 'PICKUP', 'TRANSLOAD', 'RESTOCK_REWORK');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('DRAFT', 'READY', 'IN_PROGRESS', 'CONSOLIDATED', 'IN_TRANSIT', 'DECONSOLIDATED', 'CLOSED');

-- CreateEnum
CREATE TYPE "CargoState" AS ENUM ('EXPECTED', 'ON_STOCK', 'LOADED', 'SHIPPED');

-- CreateEnum
CREATE TYPE "UnitType" AS ENUM ('STANDARD_48X40', 'XL');

-- CreateEnum
CREATE TYPE "OperationKind" AS ENUM ('UNLOADING', 'DISPOSAL', 'RESTACK', 'LOADING', 'STORAGE');

-- CreateEnum
CREATE TYPE "CarrierType" AS ENUM ('COMPANY', 'OWN_DRIVER', 'SELF_PICKUP');

-- CreateEnum
CREATE TYPE "AttachmentKind" AS ENUM ('PHOTO', 'DOC', 'BOL');

-- CreateEnum
CREATE TYPE "SkuCategory" AS ENUM ('SECUREMENT', 'EDGE_PROTECT', 'WRAP');

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "balanceCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "initials" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "companyId" TEXT,
    "hubId" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hub" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "province" TEXT NOT NULL,

    CONSTRAINT "Hub_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dock" (
    "id" TEXT NOT NULL,
    "hubId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "bay" TEXT NOT NULL,

    CONSTRAINT "Dock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "parentId" TEXT,
    "companyId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "type" "OrderType" NOT NULL,
    "services" "Service"[],
    "status" "OrderStatus" NOT NULL DEFAULT 'DRAFT',
    "cargoState" "CargoState" NOT NULL DEFAULT 'EXPECTED',
    "refNumber" TEXT,
    "hubId" TEXT NOT NULL,
    "dockId" TEXT,
    "dockAssignedAt" TIMESTAMP(3),
    "destCity" TEXT,
    "destProvince" TEXT,
    "destNote" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "carrierType" "CarrierType",
    "carrierName" TEXT,
    "carrierPhone" TEXT,
    "driverId" TEXT,
    "assignedToId" TEXT,
    "truckNo" TEXT,
    "trailerNo" TEXT,
    "trailerType" TEXT,
    "warehouseNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CargoLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "unitType" "UnitType" NOT NULL,
    "declaredQty" INTEGER NOT NULL,

    CONSTRAINT "CargoLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Operation" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "kind" "OperationKind" NOT NULL,
    "trailerNo" TEXT,
    "qty" INTEGER NOT NULL,
    "unitType" "UnitType" NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL,
    "billable" BOOLEAN NOT NULL DEFAULT true,
    "requiresPhoto" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Operation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceRule" (
    "id" TEXT NOT NULL,
    "hubId" TEXT,
    "operationKind" "OperationKind" NOT NULL,
    "unitType" "UnitType" NOT NULL,
    "platformCents" INTEGER NOT NULL,
    "partnerCents" INTEGER NOT NULL,

    CONSTRAINT "PriceRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sku" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "category" "SkuCategory" NOT NULL,
    "platformCents" INTEGER NOT NULL,
    "partnerCents" INTEGER NOT NULL,

    CONSTRAINT "Sku_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supply" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "skuId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,

    CONSTRAINT "Supply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "kind" "AttachmentKind" NOT NULL,
    "url" TEXT NOT NULL,
    "orderId" TEXT,
    "operationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "operationId" TEXT,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "fromStatus" "OrderStatus",
    "toStatus" "OrderStatus" NOT NULL,
    "actorId" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "User_companyId_idx" ON "User"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Dock_hubId_code_key" ON "Dock"("hubId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Order_number_key" ON "Order"("number");

-- CreateIndex
CREATE INDEX "Order_companyId_status_idx" ON "Order"("companyId", "status");

-- CreateIndex
CREATE INDEX "Order_parentId_idx" ON "Order"("parentId");

-- CreateIndex
CREATE INDEX "Order_refNumber_idx" ON "Order"("refNumber");

-- CreateIndex
CREATE INDEX "Order_closedAt_idx" ON "Order"("closedAt");

-- CreateIndex
CREATE INDEX "CargoLine_orderId_idx" ON "CargoLine"("orderId");

-- CreateIndex
CREATE INDEX "Operation_orderId_appliedAt_idx" ON "Operation"("orderId", "appliedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PriceRule_hubId_operationKind_unitType_key" ON "PriceRule"("hubId", "operationKind", "unitType");

-- CreateIndex
CREATE UNIQUE INDEX "Sku_code_key" ON "Sku"("code");

-- CreateIndex
CREATE INDEX "Supply_orderId_idx" ON "Supply"("orderId");

-- CreateIndex
CREATE INDEX "Attachment_orderId_idx" ON "Attachment"("orderId");

-- CreateIndex
CREATE INDEX "Attachment_operationId_idx" ON "Attachment"("operationId");

-- CreateIndex
CREATE INDEX "Comment_orderId_idx" ON "Comment"("orderId");

-- CreateIndex
CREATE INDEX "OrderEvent_orderId_at_idx" ON "OrderEvent"("orderId", "at");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "Hub"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dock" ADD CONSTRAINT "Dock_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "Hub"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "Hub"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_dockId_fkey" FOREIGN KEY ("dockId") REFERENCES "Dock"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CargoLine" ADD CONSTRAINT "CargoLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Operation" ADD CONSTRAINT "Operation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceRule" ADD CONSTRAINT "PriceRule_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "Hub"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supply" ADD CONSTRAINT "Supply_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supply" ADD CONSTRAINT "Supply_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "Sku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "Operation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "Operation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
