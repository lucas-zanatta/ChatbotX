-- Coexist resume model: replace opaque Graph cursor with timestamp watermark.
-- The dropped lastCursor was tied to the Page access token and 400'd on rotation;
-- lastSyncedAt is the oldest conversation.updated_time processed so far and survives
-- token rotation. Drives both within-run chunk resume and cross-run reconnect
-- resume (derived ceiling from the prior CoexistSyncRun row).
--
-- lock_timeout protects against blocking the worker queue when an in-flight
-- write holds AccessExclusive contention on CoexistSyncRun. Fails fast (5s)
-- so the deploy script surfaces the contention instead of stalling indefinitely.
SET lock_timeout = '5s';
ALTER TABLE "CoexistSyncRun" DROP COLUMN IF EXISTS "lastCursor";
ALTER TABLE "CoexistSyncRun" ADD COLUMN "lastSyncedAt" timestamp (6) with time zone;
