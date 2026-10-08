CREATE INDEX "DailyChecklistItem_date_status_lastRemindedAt_idx"
ON "DailyChecklistItem"("date", "status", "lastRemindedAt");
