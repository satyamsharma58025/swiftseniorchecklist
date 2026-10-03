CREATE TYPE "DispatchSlot" AS ENUM ('MORNING', 'EVENING');

CREATE TYPE "DispatchStatus" AS ENUM (
  'CLAIMED',
  'SENT',
  'FAILED',
  'FAILED_PERMANENT',
  'SKIPPED_NO_PHONE',
  'SKIPPED_NO_TASKS'
);

CREATE TABLE "DispatchLog" (
  "id" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "slot" "DispatchSlot" NOT NULL,
  "employeeId" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "status" "DispatchStatus" NOT NULL DEFAULT 'CLAIMED',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "providerMessageId" TEXT,
  "formUrl" TEXT,
  "lastError" TEXT,
  "claimedAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "lastAttemptAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DispatchLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DispatchLog_date_slot_employeeId_key"
ON "DispatchLog"("date", "slot", "employeeId");

CREATE INDEX "DispatchLog_date_slot_status_idx"
ON "DispatchLog"("date", "slot", "status");