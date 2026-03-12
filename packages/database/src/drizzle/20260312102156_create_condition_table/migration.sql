ALTER TYPE "FolderType" ADD VALUE IF NOT EXISTS 'trigger';
ALTER TYPE "FolderType" ADD VALUE IF NOT EXISTS 'webhook';
ALTER TYPE "SenderType" ADD VALUE IF NOT EXISTS 'api';

DROP TABLE IF EXISTS "Condition";
DROP TABLE IF EXISTS "TriggerContactHistory";
DROP TABLE IF EXISTS "TriggerExecution";
DROP TABLE IF EXISTS "TriggerStats";
DROP TABLE IF EXISTS "Trigger";
DROP TABLE IF EXISTS "Webhook";

CREATE TABLE "Condition" (
	"id" text PRIMARY KEY,
	"createdAt" timestamp(3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp(3) DEFAULT now() NOT NULL,
	"triggerId" text,
	"webhookId" text,
	"eventType" smallint NOT NULL,
	"eventSourceId" text,
	"operator" text,
	"value" text,
	"conditionGroup" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "TriggerContactHistory" (
	"id" text PRIMARY KEY,
	"createdAt" timestamp(3) DEFAULT now() NOT NULL,
	"triggerId" text NOT NULL,
	"contactId" text NOT NULL,
	"executedAt" timestamp(3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "TriggerExecution" (
	"id" text PRIMARY KEY,
	"createdAt" timestamp(3) DEFAULT now() NOT NULL,
	"triggerId" text NOT NULL,
	"contactId" text NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"executedAt" timestamp(3) DEFAULT now() NOT NULL,
	"completedAt" timestamp(3),
	"actions" jsonb DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Trigger" (
	"id" text PRIMARY KEY,
	"createdAt" timestamp(3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp(3) DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"folderId" text,
	"chatbotId" text NOT NULL,
	"actions" jsonb DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "TriggerStats" (
	"id" text PRIMARY KEY,
	"createdAt" timestamp(3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp(3) DEFAULT now() NOT NULL,
	"triggerId" text NOT NULL,
	"totalExecutions" integer DEFAULT 0 NOT NULL,
	"successfulExecutions" integer DEFAULT 0 NOT NULL,
	"failedExecutions" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Webhook" (
	"id" text PRIMARY KEY,
	"createdAt" timestamp(3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp(3) DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"folderId" text,
	"chatbotId" text NOT NULL,
	"url" text NOT NULL,
	"method" text DEFAULT 'POST' NOT NULL,
	"headers" jsonb DEFAULT '{}' NOT NULL,
	"body" jsonb DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE INDEX "Condition_triggerId_idx" ON "Condition" ("triggerId");--> statement-breakpoint
CREATE INDEX "Condition_webhookId_idx" ON "Condition" ("webhookId");--> statement-breakpoint
CREATE INDEX "Condition_eventType_eventSourceId_idx" ON "Condition" ("eventType","eventSourceId");--> statement-breakpoint
CREATE INDEX "TriggerContactHistory_triggerId_idx" ON "TriggerContactHistory" ("triggerId");--> statement-breakpoint
CREATE INDEX "TriggerContactHistory_contactId_idx" ON "TriggerContactHistory" ("contactId");--> statement-breakpoint
CREATE INDEX "TriggerContactHistory_triggerId_contactId_idx" ON "TriggerContactHistory" ("triggerId","contactId");--> statement-breakpoint
CREATE INDEX "TriggerExecution_triggerId_idx" ON "TriggerExecution" ("triggerId");--> statement-breakpoint
CREATE INDEX "TriggerExecution_contactId_idx" ON "TriggerExecution" ("contactId");--> statement-breakpoint
CREATE INDEX "Trigger_chatbotId_idx" ON "Trigger" ("chatbotId");--> statement-breakpoint
CREATE INDEX "Trigger_folderId_idx" ON "Trigger" ("folderId");--> statement-breakpoint
CREATE UNIQUE INDEX "TriggerStats_triggerId_key" ON "TriggerStats" ("triggerId");--> statement-breakpoint
CREATE INDEX "Webhook_chatbotId_idx" ON "Webhook" ("chatbotId");--> statement-breakpoint
CREATE INDEX "Webhook_folderId_idx" ON "Webhook" ("folderId");--> statement-breakpoint
ALTER TABLE "Condition" ADD CONSTRAINT "Condition_triggerId_fkey" FOREIGN KEY ("triggerId") REFERENCES "Trigger"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Condition" ADD CONSTRAINT "Condition_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "Webhook"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TriggerContactHistory" ADD CONSTRAINT "TriggerContactHistory_triggerId_fkey" FOREIGN KEY ("triggerId") REFERENCES "Trigger"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TriggerContactHistory" ADD CONSTRAINT "TriggerContactHistory_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TriggerExecution" ADD CONSTRAINT "TriggerExecution_triggerId_fkey" FOREIGN KEY ("triggerId") REFERENCES "Trigger"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TriggerExecution" ADD CONSTRAINT "TriggerExecution_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Trigger" ADD CONSTRAINT "Trigger_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Trigger" ADD CONSTRAINT "Trigger_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TriggerStats" ADD CONSTRAINT "TriggerStats_triggerId_fkey" FOREIGN KEY ("triggerId") REFERENCES "Trigger"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Webhook" ADD CONSTRAINT "Webhook_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Webhook" ADD CONSTRAINT "Webhook_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
