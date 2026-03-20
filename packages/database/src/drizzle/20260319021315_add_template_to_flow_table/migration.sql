ALTER TABLE "WhatsappMessageTemplate" ADD COLUMN components JSONB NOT NULL DEFAULT '[]'::jsonb;
CREATE UNIQUE INDEX "WhatsappMessageTemplate_integrationWhatsappId_sourceId_key" ON "WhatsappMessageTemplate" ("integrationWhatsappId" text_ops,"sourceId" text_ops);
ALTER TABLE "Broadcast" ADD COLUMN IF NOT EXISTS "templateId" text;
ALTER TABLE "Broadcast" ALTER COLUMN "flowId" DROP NOT NULL;
ALTER TABLE "Broadcast" ADD COLUMN IF NOT EXISTS "templateData" jsonb NOT NULL DEFAULT '{}';
