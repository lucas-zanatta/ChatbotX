ALTER TABLE "Broadcast" ADD COLUMN "templateId" text;
ALTER TABLE "Broadcast" ALTER COLUMN "flowId" DROP NOT NULL;
