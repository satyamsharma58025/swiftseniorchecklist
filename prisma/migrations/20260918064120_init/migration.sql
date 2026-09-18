-- CreateEnum
CREATE TYPE "Cadence" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "ChecklistStatus" AS ENUM ('PENDING', 'DONE', 'NOT_DONE');

-- CreateEnum
CREATE TYPE "ColorStatus" AS ENUM ('GREEN', 'YELLOW', 'ORANGE', 'RED', 'GREY');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('SENT', 'DELIVERED', 'FAILED', 'PENDING');

-- CreateEnum
CREATE TYPE "QueueSource" AS ENUM ('AUTO', 'MANUAL');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('MANAGER', 'SENIOR', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('WHATSAPP');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED', 'SKIPPED_NO_PHONE', 'SKIPPED_OUTSIDE_WINDOW');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "role" "Role" NOT NULL,
    "passwordHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "designation" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "supervisorId" TEXT,
    "plantHeadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskMaster" (
    "id" TEXT NOT NULL,
    "taskCode" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "taskDescription" TEXT NOT NULL,
    "cadence" "Cadence" NOT NULL,
    "scheduleDetail" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "startDate" DATE,
    "endDate" DATE,
    "escalationThreshold" INTEGER NOT NULL DEFAULT 2,
    "category" TEXT,
    "notes" TEXT,
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssignmentQueueItem" (
    "id" TEXT NOT NULL,
    "queueCode" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "employeeId" TEXT NOT NULL,
    "taskDescription" TEXT NOT NULL,
    "source" "QueueSource" NOT NULL DEFAULT 'AUTO',
    "taskMasterId" TEXT,
    "includeToday" BOOLEAN NOT NULL DEFAULT true,
    "priority" "Priority" NOT NULL,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssignmentQueueItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyChecklistItem" (
    "id" TEXT NOT NULL,
    "checklistCode" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "taskMasterId" TEXT NOT NULL,
    "employeeName" TEXT NOT NULL,
    "employeePhone" TEXT,
    "taskDescription" TEXT NOT NULL,
    "supervisorName" TEXT NOT NULL,
    "supervisorPhone" TEXT,
    "escalationThreshold" INTEGER NOT NULL,
    "priority" "Priority" NOT NULL,
    "status" "ChecklistStatus" NOT NULL DEFAULT 'PENDING',
    "seniorRemarks" TEXT,
    "employeeResponse" TEXT,
    "employeeRespondedAt" TIMESTAMP(3),
    "reminderCount" INTEGER NOT NULL DEFAULT 0,
    "lastRemindedAt" TIMESTAMP(3),
    "escalated" BOOLEAN NOT NULL DEFAULT false,
    "escalatedAt" TIMESTAMP(3),
    "escalationTier" INTEGER,
    "colorStatus" "ColorStatus" NOT NULL DEFAULT 'YELLOW',
    "deliveryStatus" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "needsManualReconciliation" BOOLEAN NOT NULL DEFAULT false,
    "formSubmissionTimestamp" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EscalationLog" (
    "id" TEXT NOT NULL,
    "checklistItemId" TEXT NOT NULL,
    "escalationTier" INTEGER NOT NULL DEFAULT 1,
    "escalatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reminderCountAtEscalation" INTEGER NOT NULL,
    "supervisorNotified" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "EscalationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL,
    "checklistItemId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'WHATSAPP',
    "templateName" TEXT NOT NULL,
    "recipientPhone" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL,
    "providerMessageId" TEXT,
    "errorMessage" TEXT,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "checklistItemId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "fromStatus" "ChecklistStatus",
    "toStatus" "ChecklistStatus",
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Holiday" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "appliesTo" TEXT NOT NULL DEFAULT 'All',
    "notes" TEXT,

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskPause" (
    "id" TEXT NOT NULL,
    "taskMasterId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "pausedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskPause_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reassignment" (
    "id" TEXT NOT NULL,
    "taskMasterId" TEXT NOT NULL,
    "previousEmployeeId" TEXT NOT NULL,
    "newEmployeeId" TEXT NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "reassignedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reassignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "reminderIntervalHoursDefault" INTEGER NOT NULL DEFAULT 4,
    "reminderIntervalHoursHigh" INTEGER NOT NULL DEFAULT 2,
    "maxRemindersPerDayHigh" INTEGER NOT NULL DEFAULT 4,
    "escalationThresholdDefault" INTEGER NOT NULL DEFAULT 2,
    "escalationTier2Enabled" BOOLEAN NOT NULL DEFAULT false,
    "assignmentQueueLockTimeIst" TEXT NOT NULL DEFAULT '08:30',
    "dailyFormSendTimeIst" TEXT NOT NULL DEFAULT '09:00',
    "eodCutoffTimeIst" TEXT NOT NULL DEFAULT '19:00',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CronRunLog" (
    "id" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "runDate" DATE NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "itemsTouched" INTEGER,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,

    CONSTRAINT "CronRunLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "TaskMaster_taskCode_key" ON "TaskMaster"("taskCode");

-- CreateIndex
CREATE INDEX "TaskMaster_active_idx" ON "TaskMaster"("active");

-- CreateIndex
CREATE UNIQUE INDEX "AssignmentQueueItem_queueCode_key" ON "AssignmentQueueItem"("queueCode");

-- CreateIndex
CREATE INDEX "AssignmentQueueItem_date_locked_idx" ON "AssignmentQueueItem"("date", "locked");

-- CreateIndex
CREATE UNIQUE INDEX "AssignmentQueueItem_taskMasterId_date_key" ON "AssignmentQueueItem"("taskMasterId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyChecklistItem_checklistCode_key" ON "DailyChecklistItem"("checklistCode");

-- CreateIndex
CREATE INDEX "DailyChecklistItem_date_idx" ON "DailyChecklistItem"("date");

-- CreateIndex
CREATE INDEX "DailyChecklistItem_status_idx" ON "DailyChecklistItem"("status");

-- CreateIndex
CREATE INDEX "DailyChecklistItem_escalated_idx" ON "DailyChecklistItem"("escalated");

-- CreateIndex
CREATE UNIQUE INDEX "DailyChecklistItem_taskMasterId_date_key" ON "DailyChecklistItem"("taskMasterId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "CronRunLog_jobName_runDate_key" ON "CronRunLog"("jobName", "runDate");

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_plantHeadId_fkey" FOREIGN KEY ("plantHeadId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskMaster" ADD CONSTRAINT "TaskMaster_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentQueueItem" ADD CONSTRAINT "AssignmentQueueItem_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentQueueItem" ADD CONSTRAINT "AssignmentQueueItem_taskMasterId_fkey" FOREIGN KEY ("taskMasterId") REFERENCES "TaskMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyChecklistItem" ADD CONSTRAINT "DailyChecklistItem_taskMasterId_fkey" FOREIGN KEY ("taskMasterId") REFERENCES "TaskMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscalationLog" ADD CONSTRAINT "EscalationLog_checklistItemId_fkey" FOREIGN KEY ("checklistItemId") REFERENCES "DailyChecklistItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_checklistItemId_fkey" FOREIGN KEY ("checklistItemId") REFERENCES "DailyChecklistItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_checklistItemId_fkey" FOREIGN KEY ("checklistItemId") REFERENCES "DailyChecklistItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskPause" ADD CONSTRAINT "TaskPause_taskMasterId_fkey" FOREIGN KEY ("taskMasterId") REFERENCES "TaskMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reassignment" ADD CONSTRAINT "Reassignment_taskMasterId_fkey" FOREIGN KEY ("taskMasterId") REFERENCES "TaskMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
