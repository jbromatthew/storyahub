-- AlterTable
ALTER TABLE "Todo" ADD COLUMN "meetingId" TEXT;

-- AddForeignKey
ALTER TABLE "Todo" ADD CONSTRAINT "Todo_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE SET NULL ON UPDATE CASCADE;
