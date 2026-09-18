-- AlterEnum
ALTER TYPE "Cadence" ADD VALUE 'QUARTERLY';

-- DropForeignKey
ALTER TABLE "NotificationLog" DROP CONSTRAINT "NotificationLog_checklistItemId_fkey";

-- AlterTable
ALTER TABLE "NotificationLog" ALTER COLUMN "checklistItemId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "seniorAuthorityName" TEXT,
ADD COLUMN     "seniorAuthorityPhone" TEXT;

-- CreateTable
CREATE TABLE "QueueCodeSequence" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "nextValue" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QueueCodeSequence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QueueCodeSequence_date_key" ON "QueueCodeSequence"("date");

-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_checklistItemId_fkey" FOREIGN KEY ("checklistItemId") REFERENCES "DailyChecklistItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
