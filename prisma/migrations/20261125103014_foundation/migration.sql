-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchant" TEXT NOT NULL,
    "customer" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'THB',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Link" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "methods" TEXT NOT NULL,
    "expires" DATETIME NOT NULL,
    "activeSlot" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Link_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Attempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchant" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "settlement" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Attempt_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Attempt_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "Link" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchant" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AgentAction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "result" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentAction_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchant" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "Order_merchant_status_createdAt_idx" ON "Order"("merchant", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Order_merchant_createdAt_idx" ON "Order"("merchant", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Link_activeSlot_key" ON "Link"("activeSlot");

-- CreateIndex
CREATE INDEX "Link_orderId_createdAt_idx" ON "Link"("orderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Attempt_requestId_key" ON "Attempt"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "Attempt_settlement_key" ON "Attempt"("settlement");

-- CreateIndex
CREATE INDEX "Attempt_merchant_status_createdAt_idx" ON "Attempt"("merchant", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Attempt_merchant_createdAt_idx" ON "Attempt"("merchant", "createdAt");

-- CreateIndex
CREATE INDEX "Attempt_orderId_createdAt_idx" ON "Attempt"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "Attempt_linkId_createdAt_idx" ON "Attempt"("linkId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentRun_merchant_createdAt_idx" ON "AgentRun"("merchant", "createdAt");

-- CreateIndex
CREATE INDEX "AgentAction_runId_createdAt_idx" ON "AgentAction"("runId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_actionId_key" ON "Notification"("actionId");

-- CreateIndex
CREATE INDEX "Notification_merchant_orderId_createdAt_idx" ON "Notification"("merchant", "orderId", "createdAt");
