-- Composite partial index for fetchPriorRunCeiling in coexist messenger-sync.
-- The query filters on (integrationId, channel, status IN ('succeeded','partial'))
-- and ORDER BY startedAt DESC LIMIT 1 every chunk. The existing single-column
-- CoexistSyncRun_integration_idx forces a full per-integration sort; this
-- index turns the lookup into an index-only point read.
SET lock_timeout = '5s';
CREATE INDEX IF NOT EXISTS "CoexistSyncRun_integration_resume_idx"
  ON "CoexistSyncRun" ("integrationId", "channel", "startedAt" DESC)
  WHERE status IN ('succeeded', 'partial');
