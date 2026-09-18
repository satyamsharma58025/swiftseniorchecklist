-- AlterTable
ALTER TABLE "ActivityLog" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "AssignmentQueueItem" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "CronRunLog" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "DailyChecklistItem" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "EscalationLog" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "Holiday" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "NotificationLog" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "QueueCodeSequence" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "Reassignment" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "TaskMaster" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "TaskPause" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "WebhookEvent" ADD COLUMN     "organizationId" TEXT;

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Default Organization',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

INSERT INTO "Organization" ("id", "name", "createdAt")
VALUES ('default-org', 'Default Organization', NOW());

UPDATE "User" SET "organizationId" = 'default-org' WHERE "organizationId" IS NULL;
UPDATE "Employee" SET "organizationId" = 'default-org' WHERE "organizationId" IS NULL;
UPDATE "TaskMaster" SET "organizationId" = 'default-org' WHERE "organizationId" IS NULL;
UPDATE "QueueCodeSequence" SET "organizationId" = 'default-org' WHERE "organizationId" IS NULL;
UPDATE "AssignmentQueueItem" SET "organizationId" = 'default-org' WHERE "organizationId" IS NULL;
UPDATE "DailyChecklistItem" SET "organizationId" = 'default-org' WHERE "organizationId" IS NULL;
UPDATE "EscalationLog" SET "organizationId" = 'default-org' WHERE "organizationId" IS NULL;
UPDATE "NotificationLog" SET "organizationId" = 'default-org' WHERE "organizationId" IS NULL;
UPDATE "ActivityLog" SET "organizationId" = 'default-org' WHERE "organizationId" IS NULL;
UPDATE "WebhookEvent" SET "organizationId" = 'default-org' WHERE "organizationId" IS NULL;
UPDATE "Holiday" SET "organizationId" = 'default-org' WHERE "organizationId" IS NULL;
UPDATE "TaskPause" SET "organizationId" = 'default-org' WHERE "organizationId" IS NULL;
UPDATE "Reassignment" SET "organizationId" = 'default-org' WHERE "organizationId" IS NULL;
UPDATE "Settings" SET "organizationId" = 'default-org' WHERE "organizationId" IS NULL;
UPDATE "CronRunLog" SET "organizationId" = 'default-org' WHERE "organizationId" IS NULL;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskMaster" ADD CONSTRAINT "TaskMaster_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueCodeSequence" ADD CONSTRAINT "QueueCodeSequence_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentQueueItem" ADD CONSTRAINT "AssignmentQueueItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyChecklistItem" ADD CONSTRAINT "DailyChecklistItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscalationLog" ADD CONSTRAINT "EscalationLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Holiday" ADD CONSTRAINT "Holiday_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskPause" ADD CONSTRAINT "TaskPause_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reassignment" ADD CONSTRAINT "Reassignment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settings" ADD CONSTRAINT "Settings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CronRunLog" ADD CONSTRAINT "CronRunLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
