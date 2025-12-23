-- NOTE: This migration is intentionally re-runnable in development.
-- WARNING: Dropping tables will delete all sequence-related data.
DROP TABLE IF EXISTS "SequenceDispatch" CASCADE;
DROP TABLE IF EXISTS "SequenceEvent" CASCADE;
DROP TABLE IF EXISTS "ContactsOnSequence" CASCADE;
DROP TABLE IF EXISTS "SequencesOnFolders" CASCADE;
DROP TABLE IF EXISTS "SequenceStep" CASCADE;
DROP TABLE IF EXISTS "Sequence" CASCADE;
DROP TABLE IF EXISTS "SequenceFolder" CASCADE;

-- CreateTable
CREATE TABLE "SequenceFolder" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "depth" INTEGER NOT NULL DEFAULT 1,
    "position" INTEGER NOT NULL DEFAULT 0,
    "totalSequencesCount" INTEGER NOT NULL DEFAULT 0,
    "chatbotId" TEXT NOT NULL,
    "parentId" TEXT,

    CONSTRAINT "SequenceFolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sequence" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "subscribers" INTEGER NOT NULL DEFAULT 0,
    "messages" INTEGER NOT NULL DEFAULT 0,
    "openRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ctr" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "chatbotId" TEXT NOT NULL,

    CONSTRAINT "Sequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SequenceStep" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "order" INTEGER NOT NULL,
    "delayDays" INTEGER NOT NULL,
    "delayMinutes" INTEGER NOT NULL DEFAULT 0,
    "delayUnit" TEXT DEFAULT 'days',
    "specificDateTime" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "anytime" BOOLEAN NOT NULL DEFAULT true,
    "sendTimeStart" TEXT,
    "sendTimeEnd" TEXT,
    "sendDays" TEXT DEFAULT '["monday","tuesday","wednesday","thursday","friday","saturday","sunday"]',
    "flowId" TEXT,
    "sequenceId" TEXT NOT NULL,

    CONSTRAINT "SequenceStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactsOnSequence" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "nextRunAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "lockOwner" TEXT,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "contactId" TEXT NOT NULL,
    "sequenceId" TEXT NOT NULL,
    "chatbotId" TEXT NOT NULL,

    CONSTRAINT "ContactsOnSequence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SequenceFolder_chatbotId_name_key" ON "SequenceFolder"("chatbotId", "name");

-- CreateIndex
CREATE INDEX "SequenceFolder_chatbotId_idx" ON "SequenceFolder"("chatbotId");

-- CreateIndex
CREATE INDEX "SequenceFolder_parentId_idx" ON "SequenceFolder"("parentId");

-- CreateIndex
CREATE INDEX "SequenceFolder_chatbotId_parentId_position_idx" ON "SequenceFolder"("chatbotId", "parentId", "position");

-- CreateIndex
CREATE INDEX "Sequence_chatbotId_idx" ON "Sequence"("chatbotId");

-- CreateIndex
CREATE INDEX "SequenceStep_sequenceId_idx" ON "SequenceStep"("sequenceId");

-- CreateIndex
CREATE INDEX "SequenceStep_flowId_idx" ON "SequenceStep"("flowId");

-- CreateIndex
CREATE INDEX "ContactsOnSequence_sequenceId_idx" ON "ContactsOnSequence"("sequenceId");

-- CreateIndex
CREATE INDEX "ContactsOnSequence_contactId_idx" ON "ContactsOnSequence"("contactId");

-- CreateIndex
CREATE INDEX "ContactsOnSequence_chatbotId_idx" ON "ContactsOnSequence"("chatbotId");

-- CreateIndex (for scheduler: query pending jobs)
CREATE INDEX "ContactsOnSequence_status_nextRunAt_idx" ON "ContactsOnSequence"("status", "nextRunAt") WHERE "nextRunAt" IS NOT NULL;

-- CreateIndex (for scheduler by chatbot)
CREATE INDEX "ContactsOnSequence_chatbotId_status_nextRunAt_idx" ON "ContactsOnSequence"("chatbotId", "status", "nextRunAt") WHERE "nextRunAt" IS NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "ContactsOnSequence_contactId_sequenceId_key" ON "ContactsOnSequence"("contactId", "sequenceId");

-- AddForeignKey
ALTER TABLE "SequenceFolder" ADD CONSTRAINT "SequenceFolder_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SequenceFolder" ADD CONSTRAINT "SequenceFolder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "SequenceFolder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sequence" ADD CONSTRAINT "Sequence_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "SequencesOnFolders" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sequenceId" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,

    CONSTRAINT "SequencesOnFolders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SequencesOnFolders_sequenceId_idx" ON "SequencesOnFolders"("sequenceId");

-- CreateIndex
CREATE INDEX "SequencesOnFolders_folderId_idx" ON "SequencesOnFolders"("folderId");

-- CreateIndex
CREATE UNIQUE INDEX "SequencesOnFolders_sequenceId_folderId_key" ON "SequencesOnFolders"("sequenceId", "folderId");

-- AddForeignKey
ALTER TABLE "SequencesOnFolders" ADD CONSTRAINT "SequencesOnFolders_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "Sequence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SequencesOnFolders" ADD CONSTRAINT "SequencesOnFolders_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "SequenceFolder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SequenceStep" ADD CONSTRAINT "SequenceStep_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SequenceStep" ADD CONSTRAINT "SequenceStep_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "Sequence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactsOnSequence" ADD CONSTRAINT "ContactsOnSequence_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactsOnSequence" ADD CONSTRAINT "ContactsOnSequence_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "Sequence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactsOnSequence" ADD CONSTRAINT "ContactsOnSequence_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: SequenceEvent (partitioned by HASH on chatbotId, 64 buckets)
CREATE TABLE "SequenceEvent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eventType" TEXT NOT NULL,
    "payload" JSONB,
    "chatbotId" TEXT NOT NULL,
    "sequenceId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "stepId" TEXT,
    "dispatchId" TEXT,

    CONSTRAINT "SequenceEvent_pkey" PRIMARY KEY ("id", "chatbotId")
) PARTITION BY HASH ("chatbotId");

-- Create 64 partitions for SequenceEvent
CREATE TABLE "SequenceEvent_p00" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 0);
CREATE TABLE "SequenceEvent_p01" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 1);
CREATE TABLE "SequenceEvent_p02" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 2);
CREATE TABLE "SequenceEvent_p03" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 3);
CREATE TABLE "SequenceEvent_p04" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 4);
CREATE TABLE "SequenceEvent_p05" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 5);
CREATE TABLE "SequenceEvent_p06" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 6);
CREATE TABLE "SequenceEvent_p07" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 7);
CREATE TABLE "SequenceEvent_p08" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 8);
CREATE TABLE "SequenceEvent_p09" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 9);
CREATE TABLE "SequenceEvent_p10" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 10);
CREATE TABLE "SequenceEvent_p11" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 11);
CREATE TABLE "SequenceEvent_p12" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 12);
CREATE TABLE "SequenceEvent_p13" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 13);
CREATE TABLE "SequenceEvent_p14" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 14);
CREATE TABLE "SequenceEvent_p15" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 15);
CREATE TABLE "SequenceEvent_p16" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 16);
CREATE TABLE "SequenceEvent_p17" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 17);
CREATE TABLE "SequenceEvent_p18" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 18);
CREATE TABLE "SequenceEvent_p19" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 19);
CREATE TABLE "SequenceEvent_p20" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 20);
CREATE TABLE "SequenceEvent_p21" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 21);
CREATE TABLE "SequenceEvent_p22" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 22);
CREATE TABLE "SequenceEvent_p23" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 23);
CREATE TABLE "SequenceEvent_p24" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 24);
CREATE TABLE "SequenceEvent_p25" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 25);
CREATE TABLE "SequenceEvent_p26" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 26);
CREATE TABLE "SequenceEvent_p27" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 27);
CREATE TABLE "SequenceEvent_p28" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 28);
CREATE TABLE "SequenceEvent_p29" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 29);
CREATE TABLE "SequenceEvent_p30" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 30);
CREATE TABLE "SequenceEvent_p31" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 31);
CREATE TABLE "SequenceEvent_p32" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 32);
CREATE TABLE "SequenceEvent_p33" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 33);
CREATE TABLE "SequenceEvent_p34" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 34);
CREATE TABLE "SequenceEvent_p35" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 35);
CREATE TABLE "SequenceEvent_p36" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 36);
CREATE TABLE "SequenceEvent_p37" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 37);
CREATE TABLE "SequenceEvent_p38" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 38);
CREATE TABLE "SequenceEvent_p39" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 39);
CREATE TABLE "SequenceEvent_p40" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 40);
CREATE TABLE "SequenceEvent_p41" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 41);
CREATE TABLE "SequenceEvent_p42" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 42);
CREATE TABLE "SequenceEvent_p43" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 43);
CREATE TABLE "SequenceEvent_p44" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 44);
CREATE TABLE "SequenceEvent_p45" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 45);
CREATE TABLE "SequenceEvent_p46" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 46);
CREATE TABLE "SequenceEvent_p47" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 47);
CREATE TABLE "SequenceEvent_p48" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 48);
CREATE TABLE "SequenceEvent_p49" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 49);
CREATE TABLE "SequenceEvent_p50" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 50);
CREATE TABLE "SequenceEvent_p51" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 51);
CREATE TABLE "SequenceEvent_p52" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 52);
CREATE TABLE "SequenceEvent_p53" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 53);
CREATE TABLE "SequenceEvent_p54" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 54);
CREATE TABLE "SequenceEvent_p55" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 55);
CREATE TABLE "SequenceEvent_p56" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 56);
CREATE TABLE "SequenceEvent_p57" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 57);
CREATE TABLE "SequenceEvent_p58" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 58);
CREATE TABLE "SequenceEvent_p59" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 59);
CREATE TABLE "SequenceEvent_p60" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 60);
CREATE TABLE "SequenceEvent_p61" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 61);
CREATE TABLE "SequenceEvent_p62" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 62);
CREATE TABLE "SequenceEvent_p63" PARTITION OF "SequenceEvent" FOR VALUES WITH (MODULUS 64, REMAINDER 63);

-- CreateIndex for SequenceEvent
CREATE INDEX "SequenceEvent_chatbotId_occurredAt_idx" ON "SequenceEvent"("chatbotId", "occurredAt");
CREATE INDEX "SequenceEvent_contactId_occurredAt_idx" ON "SequenceEvent"("contactId", "occurredAt");
CREATE INDEX "SequenceEvent_sequenceId_eventType_idx" ON "SequenceEvent"("sequenceId", "eventType");

-- CreateTable: SequenceDispatch (partitioned by HASH on chatbotId, 64 buckets)
CREATE TABLE "SequenceDispatch" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "runAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "idempotencyKey" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "lockedAt" TIMESTAMP(3),
    "lockOwner" TEXT,
    "completedAt" TIMESTAMP(3),
    "chatbotId" TEXT NOT NULL,
    "sequenceId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,

    CONSTRAINT "SequenceDispatch_pkey" PRIMARY KEY ("id", "chatbotId")
) PARTITION BY HASH ("chatbotId");

-- Create 64 partitions for SequenceDispatch
CREATE TABLE "SequenceDispatch_p00" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 0);
CREATE TABLE "SequenceDispatch_p01" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 1);
CREATE TABLE "SequenceDispatch_p02" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 2);
CREATE TABLE "SequenceDispatch_p03" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 3);
CREATE TABLE "SequenceDispatch_p04" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 4);
CREATE TABLE "SequenceDispatch_p05" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 5);
CREATE TABLE "SequenceDispatch_p06" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 6);
CREATE TABLE "SequenceDispatch_p07" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 7);
CREATE TABLE "SequenceDispatch_p08" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 8);
CREATE TABLE "SequenceDispatch_p09" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 9);
CREATE TABLE "SequenceDispatch_p10" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 10);
CREATE TABLE "SequenceDispatch_p11" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 11);
CREATE TABLE "SequenceDispatch_p12" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 12);
CREATE TABLE "SequenceDispatch_p13" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 13);
CREATE TABLE "SequenceDispatch_p14" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 14);
CREATE TABLE "SequenceDispatch_p15" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 15);
CREATE TABLE "SequenceDispatch_p16" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 16);
CREATE TABLE "SequenceDispatch_p17" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 17);
CREATE TABLE "SequenceDispatch_p18" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 18);
CREATE TABLE "SequenceDispatch_p19" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 19);
CREATE TABLE "SequenceDispatch_p20" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 20);
CREATE TABLE "SequenceDispatch_p21" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 21);
CREATE TABLE "SequenceDispatch_p22" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 22);
CREATE TABLE "SequenceDispatch_p23" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 23);
CREATE TABLE "SequenceDispatch_p24" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 24);
CREATE TABLE "SequenceDispatch_p25" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 25);
CREATE TABLE "SequenceDispatch_p26" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 26);
CREATE TABLE "SequenceDispatch_p27" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 27);
CREATE TABLE "SequenceDispatch_p28" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 28);
CREATE TABLE "SequenceDispatch_p29" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 29);
CREATE TABLE "SequenceDispatch_p30" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 30);
CREATE TABLE "SequenceDispatch_p31" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 31);
CREATE TABLE "SequenceDispatch_p32" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 32);
CREATE TABLE "SequenceDispatch_p33" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 33);
CREATE TABLE "SequenceDispatch_p34" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 34);
CREATE TABLE "SequenceDispatch_p35" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 35);
CREATE TABLE "SequenceDispatch_p36" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 36);
CREATE TABLE "SequenceDispatch_p37" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 37);
CREATE TABLE "SequenceDispatch_p38" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 38);
CREATE TABLE "SequenceDispatch_p39" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 39);
CREATE TABLE "SequenceDispatch_p40" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 40);
CREATE TABLE "SequenceDispatch_p41" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 41);
CREATE TABLE "SequenceDispatch_p42" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 42);
CREATE TABLE "SequenceDispatch_p43" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 43);
CREATE TABLE "SequenceDispatch_p44" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 44);
CREATE TABLE "SequenceDispatch_p45" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 45);
CREATE TABLE "SequenceDispatch_p46" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 46);
CREATE TABLE "SequenceDispatch_p47" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 47);
CREATE TABLE "SequenceDispatch_p48" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 48);
CREATE TABLE "SequenceDispatch_p49" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 49);
CREATE TABLE "SequenceDispatch_p50" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 50);
CREATE TABLE "SequenceDispatch_p51" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 51);
CREATE TABLE "SequenceDispatch_p52" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 52);
CREATE TABLE "SequenceDispatch_p53" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 53);
CREATE TABLE "SequenceDispatch_p54" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 54);
CREATE TABLE "SequenceDispatch_p55" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 55);
CREATE TABLE "SequenceDispatch_p56" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 56);
CREATE TABLE "SequenceDispatch_p57" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 57);
CREATE TABLE "SequenceDispatch_p58" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 58);
CREATE TABLE "SequenceDispatch_p59" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 59);
CREATE TABLE "SequenceDispatch_p60" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 60);
CREATE TABLE "SequenceDispatch_p61" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 61);
CREATE TABLE "SequenceDispatch_p62" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 62);
CREATE TABLE "SequenceDispatch_p63" PARTITION OF "SequenceDispatch" FOR VALUES WITH (MODULUS 64, REMAINDER 63);

-- CreateIndex for SequenceDispatch (critical for scheduler)
CREATE INDEX "SequenceDispatch_status_runAt_idx" ON "SequenceDispatch"("status", "runAt") WHERE "status" IN ('pending', 'running');
CREATE INDEX "SequenceDispatch_chatbotId_status_runAt_idx" ON "SequenceDispatch"("chatbotId", "status", "runAt") WHERE "status" IN ('pending', 'running');
CREATE UNIQUE INDEX "SequenceDispatch_idempotencyKey_key" ON "SequenceDispatch"("idempotencyKey", "chatbotId");
CREATE INDEX "SequenceDispatch_enrollmentId_idx" ON "SequenceDispatch"("enrollmentId");
