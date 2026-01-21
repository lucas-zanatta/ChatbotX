-- AlterEnum
ALTER TYPE "FolderType" ADD VALUE IF NOT EXISTS 'webhook';

-- RenameTable
ALTER TABLE "TriggerCondition" RENAME TO "Condition";

-- RenameConstraints
ALTER TABLE "Condition" RENAME CONSTRAINT "TriggerCondition_pkey" TO "Condition_pkey";
ALTER TABLE "Condition" RENAME CONSTRAINT "TriggerCondition_triggerId_fkey" TO "Condition_triggerId_fkey";

-- RenameIndexes
ALTER INDEX "TriggerCondition_type_sourceId_idx" RENAME TO "Condition_type_sourceId_idx";
ALTER INDEX "TriggerCondition_triggerId_idx" RENAME TO "Condition_triggerId_idx";
ALTER INDEX "TriggerCondition_type_sourceId_triggerId_idx" RENAME TO "Condition_type_sourceId_triggerId_idx";

-- AlterColumns
ALTER TABLE "Condition" ALTER COLUMN "triggerId" DROP NOT NULL;
ALTER TABLE "Condition" ADD COLUMN "webhookId" TEXT;

DROP TABLE IF EXISTS "Webhook";

-- CreateTable
CREATE TABLE "Webhook" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "folderId" TEXT,
    "url" TEXT NOT NULL,
    "chatbotId" TEXT NOT NULL,

    CONSTRAINT "Webhook_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Webhook_chatbotId_idx" ON "Webhook"("chatbotId");

-- CreateIndex
CREATE INDEX "Webhook_folderId_idx" ON "Webhook"("folderId");

-- CreateIndex
CREATE INDEX "Webhook_chatbotId_active_idx" ON "Webhook"("chatbotId", "active");

-- AddForeignKey
ALTER TABLE "Condition" ADD CONSTRAINT "Condition_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "Webhook"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Webhook" ADD CONSTRAINT "Webhook_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Webhook" ADD CONSTRAINT "Webhook_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
