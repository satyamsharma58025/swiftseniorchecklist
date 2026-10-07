-- Additive only: one nullable column and one new table. No existing data is changed.
ALTER TABLE "TaskMaster" ADD COLUMN "scheduleEffectiveFrom" DATE;

CREATE TABLE "TaskMasterChange" (
  "id" TEXT NOT NULL,
  "taskMasterId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "changes" JSONB NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TaskMasterChange_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TaskMasterChange_taskMasterId_createdAt_idx" ON "TaskMasterChange"("taskMasterId", "createdAt");

ALTER TABLE "TaskMasterChange"
  ADD CONSTRAINT "TaskMasterChange_taskMasterId_fkey"
  FOREIGN KEY ("taskMasterId") REFERENCES "TaskMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
