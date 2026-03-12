-- AlterEnum
ALTER TYPE "FolderType" ADD VALUE IF NOT EXISTS 'webhook';

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'TriggerCondition')
       AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'Condition') THEN
        ALTER TABLE "TriggerCondition" RENAME TO "Condition";
    END IF;
END $$;

ALTER TABLE "Condition" ALTER COLUMN "triggerId" DROP NOT NULL;
ALTER TABLE "Condition" ADD COLUMN IF NOT EXISTS "webhookId" TEXT;

DELETE FROM "Condition" WHERE "webhookId" IS NOT NULL;
DROP TABLE IF EXISTS "Webhook" CASCADE;

CREATE TABLE IF NOT EXISTS "Webhook" (
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

CREATE INDEX IF NOT EXISTS "Webhook_chatbotId_idx" ON "Webhook"("chatbotId");
CREATE INDEX IF NOT EXISTS "Webhook_folderId_idx" ON "Webhook"("folderId");
CREATE INDEX IF NOT EXISTS "Webhook_chatbotId_active_idx" ON "Webhook"("chatbotId", "active");

CREATE INDEX IF NOT EXISTS "Condition_webhookId_idx" ON "Condition"("webhookId");
CREATE INDEX IF NOT EXISTS "Condition_type_sourceId_webhookId_idx" ON "Condition"("type", "sourceId", "webhookId");

ALTER TABLE "Condition" DROP CONSTRAINT IF EXISTS "Condition_webhookId_fkey";
ALTER TABLE "Condition" ADD CONSTRAINT "Condition_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "Webhook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Webhook" DROP CONSTRAINT IF EXISTS "Webhook_chatbotId_fkey";
ALTER TABLE "Webhook" ADD CONSTRAINT "Webhook_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Webhook" DROP CONSTRAINT IF EXISTS "Webhook_folderId_fkey";
ALTER TABLE "Webhook" ADD CONSTRAINT "Webhook_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
