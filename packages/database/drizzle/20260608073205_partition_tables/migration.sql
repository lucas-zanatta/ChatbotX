-- ============================================================
-- partition_tables — combined raw-SQL migration
-- Hand-authored: drizzle-kit cannot express PARTITION BY HASH.
-- snapshot.json (auto-generated) reflects the post-migration
-- schema (composite PKs, enrollmentId single FK removed).
-- Part 1 = ContactOnBroadcast.  Part 2 = ContactOnSequence + SequenceDispatch.
-- Requires maintenance window + full backup. Pause writes.
-- ============================================================

-- ============================================================
-- MIGRATION A: ContactOnBroadcast
-- Requires maintenance window. Pause all writes before running.
-- Take a full backup before running.
-- ============================================================

-- 1. Create partitioned table with TEMPORARY constraint name
CREATE TABLE "ContactOnBroadcast_new" (
  "broadcastId"    bigint NOT NULL,
  "contactId"      bigint NOT NULL,
  "contactInboxId" bigint NOT NULL,
  "conversationId" bigint NOT NULL,
  "sent"           boolean NOT NULL DEFAULT false,
  "delivered"      boolean NOT NULL DEFAULT false,
  "seen"           boolean NOT NULL DEFAULT false,
  "clicked"        boolean NOT NULL DEFAULT false,
  "failed"         boolean NOT NULL DEFAULT false,
  "seenAt"         timestamp(6) with time zone,
  "deliveredAt"    timestamp(6) with time zone,
  "clickedAt"      timestamp(6) with time zone,
  "failedAt"       timestamp(6) with time zone,
  "errorContent"   text,
  "isRead"         boolean GENERATED ALWAYS AS (
    CASE WHEN "seenAt" IS NULL THEN false
         WHEN "deliveredAt" IS NULL THEN false
         ELSE "seenAt" >= "deliveredAt" END
  ) STORED,
  CONSTRAINT "ContactsOnBroadcast_new_pkey" PRIMARY KEY ("broadcastId", "contactId")
) PARTITION BY HASH ("broadcastId");

-- 2. Create 64 child partitions
DO $$
BEGIN
  FOR i IN 0..63 LOOP
    EXECUTE format(
      'CREATE TABLE "ContactOnBroadcast_p%s"
       PARTITION OF "ContactOnBroadcast_new"
       FOR VALUES WITH (MODULUS 64, REMAINDER %s)',
      i, i
    );
  END LOOP;
END $$;

-- 3. Copy data — explicit columns, isRead excluded (generated)
INSERT INTO "ContactOnBroadcast_new" (
  "broadcastId", "contactId", "contactInboxId", "conversationId",
  "sent", "delivered", "seen", "clicked", "failed",
  "seenAt", "deliveredAt", "clickedAt", "failedAt", "errorContent"
)
SELECT
  "broadcastId", "contactId", "contactInboxId", "conversationId",
  "sent", "delivered", "seen", "clicked", "failed",
  "seenAt", "deliveredAt", "clickedAt", "failedAt", "errorContent"
FROM "ContactOnBroadcast";

-- 4. Assert row counts match (migration aborts if not)
DO $$
DECLARE old_count bigint; new_count bigint;
BEGIN
  SELECT COUNT(*) INTO old_count FROM "ContactOnBroadcast";
  SELECT COUNT(*) INTO new_count FROM "ContactOnBroadcast_new";
  IF old_count <> new_count THEN
    RAISE EXCEPTION 'Row count mismatch: old=%, new=%', old_count, new_count;
  END IF;
END $$;

-- 5. Assert isRead computed correctly in new table
DO $$
DECLARE bad_count bigint;
BEGIN
  SELECT COUNT(*) INTO bad_count
  FROM "ContactOnBroadcast_new"
  WHERE "isRead" IS DISTINCT FROM (
    "seenAt" IS NOT NULL
    AND "deliveredAt" IS NOT NULL
    AND "seenAt" >= "deliveredAt"
  );
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'ContactOnBroadcast_new isRead mismatch: % rows', bad_count;
  END IF;
END $$;

-- 6. Create indexes with TEMPORARY names
CREATE INDEX "idx_contact_on_broadcast_contact_id_new"
  ON "ContactOnBroadcast_new" ("contactId");
CREATE INDEX "idx_contact_on_broadcast_is_read_new"
  ON "ContactOnBroadcast_new" ("isRead");

-- 7. Swap tables
ALTER TABLE "ContactOnBroadcast"     RENAME TO "ContactOnBroadcast_old";
ALTER TABLE "ContactOnBroadcast_new" RENAME TO "ContactOnBroadcast";

-- 8. Add FK constraints (_fkey suffix — Drizzle canonical naming)
ALTER TABLE "ContactOnBroadcast"
  ADD CONSTRAINT "ContactOnBroadcast_broadcastId_Broadcast_id_fkey"
    FOREIGN KEY ("broadcastId") REFERENCES "Broadcast"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ContactOnBroadcast_contactId_Contact_id_fkey"
    FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ContactOnBroadcast_contactInboxId_ContactInbox_id_fkey"
    FOREIGN KEY ("contactInboxId") REFERENCES "ContactInbox"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ContactOnBroadcast_conversationId_Conversation_id_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 9. Drop old table (releases canonical index/PK names)
DROP TABLE "ContactOnBroadcast_old";

-- 10. Rename indexes and PK to canonical names (now safe — old names are gone)
ALTER TABLE "ContactOnBroadcast"
  RENAME CONSTRAINT "ContactsOnBroadcast_new_pkey" TO "ContactsOnBroadcast_pkey";

ALTER INDEX "idx_contact_on_broadcast_contact_id_new"
  RENAME TO "idx_contact_on_broadcast_contact_id";
ALTER INDEX "idx_contact_on_broadcast_is_read_new"
  RENAME TO "idx_contact_on_broadcast_is_read";

-- 11. Assert partition count
DO $$
DECLARE partition_count bigint;
BEGIN
  SELECT COUNT(*) INTO partition_count
  FROM pg_inherits
  WHERE inhparent = '"ContactOnBroadcast"'::regclass;
  IF partition_count <> 64 THEN
    RAISE EXCEPTION 'Expected 64 partitions, got %', partition_count;
  END IF;
END $$;

-- 12. Collect statistics
ANALYZE "ContactOnBroadcast";


-- ============================================================
-- MIGRATION B: ContactOnSequence + SequenceDispatch
-- Must run together in one maintenance window. Pause all writes.
-- Take a full backup before running.
-- If any assertion fails: abort. Keep *_old tables. Investigate.
-- ============================================================

-- ── PREFLIGHT CHECKS ─────────────────────────────────────────

-- Check 1: workspaceId consistency — must be 0
DO $$
DECLARE mismatch_count bigint;
BEGIN
  SELECT COUNT(*) INTO mismatch_count
  FROM "SequenceDispatch" sd
  JOIN "ContactOnSequence" cos ON cos."id" = sd."enrollmentId"
  WHERE sd."workspaceId" <> cos."workspaceId";
  IF mismatch_count > 0 THEN
    RAISE EXCEPTION 'workspaceId mismatch: % rows in SequenceDispatch have different workspaceId than their enrollment', mismatch_count;
  END IF;
END $$;

-- Check 2: no orphaned SequenceDispatch rows — must be 0
DO $$
DECLARE orphan_count bigint;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM "SequenceDispatch" sd
  LEFT JOIN "ContactOnSequence" cos ON cos."id" = sd."enrollmentId"
  WHERE cos."id" IS NULL;
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'Orphaned SequenceDispatch rows: % rows have no matching ContactOnSequence', orphan_count;
  END IF;
END $$;

-- ── CREATE NEW TABLES ─────────────────────────────────────────

CREATE TABLE "ContactOnSequence_new" (
  "id"          bigint NOT NULL,
  "createdAt"   timestamp(6) with time zone NOT NULL DEFAULT NOW(),
  "updatedAt"   timestamp(6) with time zone NOT NULL DEFAULT NOW(),
  "enrolledAt"  timestamp(6) with time zone NOT NULL DEFAULT NOW(),
  "completedAt" timestamp(6) with time zone,
  "currentStep" integer NOT NULL DEFAULT 0,
  "status"      text,
  "nextRunAt"   timestamp(6) with time zone,
  "lastStepId"  bigint,
  "nextStepId"  bigint,
  "lockedAt"    timestamp(6) with time zone,
  "lockOwner"   text,
  "errorCount"  integer NOT NULL DEFAULT 0,
  "lastError"   text,
  "contactId"   bigint NOT NULL,
  "sequenceId"  bigint NOT NULL,
  "workspaceId" bigint NOT NULL,
  CONSTRAINT "ContactOnSequence_new_pkey" PRIMARY KEY ("id", "workspaceId")
) PARTITION BY HASH ("workspaceId");

DO $$
BEGIN
  FOR i IN 0..63 LOOP
    EXECUTE format(
      'CREATE TABLE "ContactOnSequence_p%s"
       PARTITION OF "ContactOnSequence_new"
       FOR VALUES WITH (MODULUS 64, REMAINDER %s)',
      i, i
    );
  END LOOP;
END $$;

CREATE TABLE "SequenceDispatch_new" (
  "id"             bigint NOT NULL,
  "createdAt"      timestamp(6) with time zone NOT NULL DEFAULT NOW(),
  "updatedAt"      timestamp(6) with time zone NOT NULL DEFAULT NOW(),
  "runAtMs"        bigint NOT NULL,
  "bucket"         integer NOT NULL DEFAULT 0,
  "status"         text,
  "idempotencyKey" text NOT NULL,
  "attempt"        integer NOT NULL DEFAULT 0,
  "lastError"      text,
  "lockedAt"       timestamp(6) with time zone,
  "lockOwner"      text,
  "completedAt"    timestamp(6) with time zone,
  "deliveredAt"    timestamp(6) with time zone,
  "seenAt"         timestamp(6) with time zone,
  "clickedAt"      timestamp(6) with time zone,
  "failedAt"       timestamp(6) with time zone,
  "errorContent"   text,
  "workspaceId"    bigint NOT NULL,
  "sequenceId"     bigint NOT NULL,
  "contactId"      bigint NOT NULL,
  "contactInboxId" bigint NOT NULL,
  "stepId"         bigint NOT NULL,
  "enrollmentId"   bigint NOT NULL,
  "isRead"         boolean GENERATED ALWAYS AS (
    CASE WHEN "seenAt" IS NULL THEN false
         WHEN "deliveredAt" IS NULL THEN false
         ELSE "seenAt" >= "deliveredAt" END
  ) STORED,
  CONSTRAINT "SequenceDispatch_new_pkey" PRIMARY KEY ("id", "workspaceId")
) PARTITION BY HASH ("workspaceId");

DO $$
BEGIN
  FOR i IN 0..63 LOOP
    EXECUTE format(
      'CREATE TABLE "SequenceDispatch_p%s"
       PARTITION OF "SequenceDispatch_new"
       FOR VALUES WITH (MODULUS 64, REMAINDER %s)',
      i, i
    );
  END LOOP;
END $$;

-- ── COPY DATA ─────────────────────────────────────────────────

INSERT INTO "ContactOnSequence_new" (
  "id", "createdAt", "updatedAt", "enrolledAt", "completedAt",
  "currentStep", "status", "nextRunAt", "lastStepId", "nextStepId",
  "lockedAt", "lockOwner", "errorCount", "lastError",
  "contactId", "sequenceId", "workspaceId"
)
SELECT
  "id", "createdAt", "updatedAt", "enrolledAt", "completedAt",
  "currentStep", "status", "nextRunAt", "lastStepId", "nextStepId",
  "lockedAt", "lockOwner", "errorCount", "lastError",
  "contactId", "sequenceId", "workspaceId"
FROM "ContactOnSequence";

INSERT INTO "SequenceDispatch_new" (
  "id", "createdAt", "updatedAt", "runAtMs", "bucket", "status",
  "idempotencyKey", "attempt", "lastError", "lockedAt", "lockOwner",
  "completedAt", "deliveredAt", "seenAt", "clickedAt", "failedAt",
  "errorContent", "workspaceId", "sequenceId", "contactId",
  "contactInboxId", "stepId", "enrollmentId"
)
SELECT
  "id", "createdAt", "updatedAt", "runAtMs", "bucket", "status",
  "idempotencyKey", "attempt", "lastError", "lockedAt", "lockOwner",
  "completedAt", "deliveredAt", "seenAt", "clickedAt", "failedAt",
  "errorContent", "workspaceId", "sequenceId", "contactId",
  "contactInboxId", "stepId", "enrollmentId"
FROM "SequenceDispatch";

-- ── ASSERT ROW COUNTS ─────────────────────────────────────────

DO $$
DECLARE
  old_cos bigint; new_cos bigint;
  old_sd  bigint; new_sd  bigint;
BEGIN
  SELECT COUNT(*) INTO old_cos FROM "ContactOnSequence";
  SELECT COUNT(*) INTO new_cos FROM "ContactOnSequence_new";
  SELECT COUNT(*) INTO old_sd  FROM "SequenceDispatch";
  SELECT COUNT(*) INTO new_sd  FROM "SequenceDispatch_new";
  IF old_cos <> new_cos THEN
    RAISE EXCEPTION 'ContactOnSequence count mismatch: old=%, new=%', old_cos, new_cos;
  END IF;
  IF old_sd <> new_sd THEN
    RAISE EXCEPTION 'SequenceDispatch count mismatch: old=%, new=%', old_sd, new_sd;
  END IF;
END $$;

-- Assert isRead computed correctly in SequenceDispatch_new
DO $$
DECLARE bad_count bigint;
BEGIN
  SELECT COUNT(*) INTO bad_count
  FROM "SequenceDispatch_new"
  WHERE "isRead" IS DISTINCT FROM (
    "seenAt" IS NOT NULL
    AND "deliveredAt" IS NOT NULL
    AND "seenAt" >= "deliveredAt"
  );
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'SequenceDispatch_new isRead mismatch: % rows', bad_count;
  END IF;
END $$;

-- ── INDEXES ON NEW TABLES (temporary names) ───────────────────

CREATE UNIQUE INDEX "ContactsOnSequence_contactId_sequenceId_workspaceId_key_new"
  ON "ContactOnSequence_new" ("contactId", "sequenceId", "workspaceId");
CREATE INDEX "ContactsOnSequence_sequenceId_idx_new"
  ON "ContactOnSequence_new" ("sequenceId");
CREATE INDEX "ContactsOnSequence_contactId_idx_new"
  ON "ContactOnSequence_new" ("contactId");
CREATE INDEX "ContactsOnSequence_workspaceId_idx_new"
  ON "ContactOnSequence_new" ("workspaceId");
CREATE INDEX "ContactsOnSequence_status_nextRunAt_idx_new"
  ON "ContactOnSequence_new" ("status", "nextRunAt");
CREATE INDEX "ContactsOnSequence_workspaceId_status_nextRunAt_idx_new"
  ON "ContactOnSequence_new" ("workspaceId", "status", "nextRunAt");

CREATE UNIQUE INDEX "SequenceDispatch_idempotencyKey_key_new"
  ON "SequenceDispatch_new" ("idempotencyKey", "workspaceId");
CREATE INDEX "SequenceDispatch_status_runAtMs_idx_new"
  ON "SequenceDispatch_new" ("status", "runAtMs");
CREATE INDEX "SequenceDispatch_workspaceId_status_runAtMs_idx_new"
  ON "SequenceDispatch_new" ("workspaceId", "status", "runAtMs");
CREATE INDEX "SequenceDispatch_bucket_status_runAtMs_idx_new"
  ON "SequenceDispatch_new" ("bucket", "status", "runAtMs");
CREATE INDEX "SequenceDispatch_enrollmentId_idx_new"
  ON "SequenceDispatch_new" ("enrollmentId");

-- ── FK CONSTRAINTS ON NEW TABLES ─────────────────────────────

ALTER TABLE "ContactOnSequence_new"
  ADD CONSTRAINT "ContactOnSequence_contactId_Contact_id_fkey"
    FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ContactOnSequence_sequenceId_Sequence_id_fkey"
    FOREIGN KEY ("sequenceId") REFERENCES "Sequence"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ContactOnSequence_workspaceId_Workspace_id_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SequenceDispatch_new"
  ADD CONSTRAINT "SequenceDispatch_workspaceId_Workspace_id_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "SequenceDispatch_sequenceId_Sequence_id_fkey"
    FOREIGN KEY ("sequenceId") REFERENCES "Sequence"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "SequenceDispatch_contactId_Contact_id_fkey"
    FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "SequenceDispatch_contactInboxId_ContactInbox_id_fkey"
    FOREIGN KEY ("contactInboxId") REFERENCES "ContactInbox"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "SequenceDispatch_stepId_SequenceStep_id_fkey"
    FOREIGN KEY ("stepId") REFERENCES "SequenceStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Composite enrollment FK — references ContactOnSequence_new by OID (survives rename).
-- Name kept <= 63 chars to avoid PostgreSQL identifier truncation.
ALTER TABLE "SequenceDispatch_new"
  ADD CONSTRAINT "SequenceDispatch_enrollment_workspace_fkey"
    FOREIGN KEY ("enrollmentId", "workspaceId")
    REFERENCES "ContactOnSequence_new"("id", "workspaceId")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ── SWAP BOTH TABLES ──────────────────────────────────────────

ALTER TABLE "ContactOnSequence"     RENAME TO "ContactOnSequence_old";
ALTER TABLE "ContactOnSequence_new" RENAME TO "ContactOnSequence";
ALTER TABLE "SequenceDispatch"      RENAME TO "SequenceDispatch_old";
ALTER TABLE "SequenceDispatch_new"  RENAME TO "SequenceDispatch";

-- ── DROP OLD TABLES ───────────────────────────────────────────
-- Drop SequenceDispatch_old first — it references ContactOnSequence_old

ALTER TABLE "SequenceDispatch_old"
  DROP CONSTRAINT IF EXISTS "SequenceDispatch_enrollmentId_ContactOnSequence_id_fkey";

DROP TABLE "SequenceDispatch_old";
DROP TABLE "ContactOnSequence_old";

-- ── RENAME TO CANONICAL NAMES (old tables gone, names now free) ─

ALTER TABLE "ContactOnSequence"
  RENAME CONSTRAINT "ContactOnSequence_new_pkey" TO "ContactOnSequence_pkey";
ALTER TABLE "SequenceDispatch"
  RENAME CONSTRAINT "SequenceDispatch_new_pkey" TO "SequenceDispatch_pkey";

ALTER INDEX "ContactsOnSequence_contactId_sequenceId_workspaceId_key_new"
  RENAME TO "ContactsOnSequence_contactId_sequenceId_workspaceId_key";
ALTER INDEX "ContactsOnSequence_sequenceId_idx_new"
  RENAME TO "ContactsOnSequence_sequenceId_idx";
ALTER INDEX "ContactsOnSequence_contactId_idx_new"
  RENAME TO "ContactsOnSequence_contactId_idx";
ALTER INDEX "ContactsOnSequence_workspaceId_idx_new"
  RENAME TO "ContactsOnSequence_workspaceId_idx";
ALTER INDEX "ContactsOnSequence_status_nextRunAt_idx_new"
  RENAME TO "ContactsOnSequence_status_nextRunAt_idx";
ALTER INDEX "ContactsOnSequence_workspaceId_status_nextRunAt_idx_new"
  RENAME TO "ContactsOnSequence_workspaceId_status_nextRunAt_idx";

ALTER INDEX "SequenceDispatch_idempotencyKey_key_new"
  RENAME TO "SequenceDispatch_idempotencyKey_key";
ALTER INDEX "SequenceDispatch_status_runAtMs_idx_new"
  RENAME TO "SequenceDispatch_status_runAtMs_idx";
ALTER INDEX "SequenceDispatch_workspaceId_status_runAtMs_idx_new"
  RENAME TO "SequenceDispatch_workspaceId_status_runAtMs_idx";
ALTER INDEX "SequenceDispatch_bucket_status_runAtMs_idx_new"
  RENAME TO "SequenceDispatch_bucket_status_runAtMs_idx";
ALTER INDEX "SequenceDispatch_enrollmentId_idx_new"
  RENAME TO "SequenceDispatch_enrollmentId_idx";

-- ── ASSERT PARTITION COUNTS ───────────────────────────────────

DO $$
DECLARE n bigint;
BEGIN
  SELECT COUNT(*) INTO n FROM pg_inherits
  WHERE inhparent = '"ContactOnSequence"'::regclass;
  IF n <> 64 THEN
    RAISE EXCEPTION 'Expected 64 partitions for ContactOnSequence, got %', n;
  END IF;
END $$;

DO $$
DECLARE n bigint;
BEGIN
  SELECT COUNT(*) INTO n FROM pg_inherits
  WHERE inhparent = '"SequenceDispatch"'::regclass;
  IF n <> 64 THEN
    RAISE EXCEPTION 'Expected 64 partitions for SequenceDispatch, got %', n;
  END IF;
END $$;

-- ── COLLECT STATISTICS ────────────────────────────────────────
ANALYZE "ContactOnSequence";
ANALYZE "SequenceDispatch";
