-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN "eventId" TEXT;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;
