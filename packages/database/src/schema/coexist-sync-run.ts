import { sql } from "drizzle-orm"
import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"

/**
 * Aggregate sync log for WhatsApp and Messenger coexistence history imports.
 * One row per sync attempt (triggered by popup-enable, buffer-chain, sweep-cron,
 * or manual). Records live progress counters and outcome counters — no per-contact
 * detail rows (by design).
 *
 * Handlers must:
 * 1. INSERT on start → capture runId
 * 2. UPDATE currentScan/currentStep/lastHeartbeatAt periodically (every ~50 items or step change)
 * 3. UPDATE importedContactCount/importedMessageCount/skippedCount/failedCount in batches
 * 4. UPDATE status/finishedAt/currentError on finish
 */
export const coexistChannel = pgEnum("coexistChannel", [
  "whatsapp",
  "messenger",
])

export const coexistRunStatus = pgEnum("coexistRunStatus", [
  "init",
  "running",
  "succeeded",
  "failed",
  "partial",
])

export const coexistSyncRunModel = pgTable(
  "CoexistSyncRun",
  {
    ...sharedColumns,
    workspaceId: bigintAsString().notNull(),
    integrationId: bigintAsString().notNull(),
    channel: coexistChannel().notNull(),
    status: coexistRunStatus().notNull().default("init"),
    // "popup-enable" | "buffer-chain" | "sweep-cron" | "manual"
    triggerSource: text().notNull(),

    // timing
    startedAt: timestamp(timestampConfig),
    finishedAt: timestamp(timestampConfig),
    lastHeartbeatAt: timestamp(timestampConfig),

    // progress (live counters — updated as job runs)
    // total items planned (e.g. total conversations)
    totalScan: integer().notNull().default(0),
    // items processed so far
    currentScan: integer().notNull().default(0),
    // human-readable: "listing conversations" | "page 3/12" | "flushing batch 5"
    currentStep: text(),
    // Messenger sync uses this as the timestamp watermark of the OLDEST
    // message.created_time processed so far. Drives within-run chunk resume
    // (next chunk skips conversations newer than this) AND cross-run resume
    // (next run derives its ceiling from the prior run's lastSyncedAt when
    // status === 'partial', or from startedAt when status === 'succeeded').
    // Survives Page access-token rotation — unlike the prior Graph `after`
    // cursor it replaced. Null on a fresh run that hasn't processed anything.
    lastSyncedAt: timestamp(timestampConfig),
    // WhatsApp coexist flush handler uses this as a batch counter for
    // continuation jobId uniqueness and human-readable progress.
    currentPageNumber: integer().notNull().default(0),

    // outcome counters
    importedContactCount: integer().notNull().default(0),
    importedMessageCount: integer().notNull().default(0),
    skippedCount: integer().notNull().default(0),
    failedCount: integer().notNull().default(0),
    attempts: integer().notNull().default(0),

    // last error message (text only, no stack)
    currentError: text(),
  },
  (t) => [
    index("CoexistSyncRun_workspace_idx").on(t.workspaceId),
    index("CoexistSyncRun_integration_idx").on(t.integrationId),
    index("CoexistSyncRun_active_idx")
      .on(t.status, t.lastHeartbeatAt)
      .where(sql`status IN ('init', 'running')`),
    // Composite partial index that powers fetchPriorRunCeiling in coexist
    // messenger-sync. The query filters by (integrationId, channel) restricted
    // to status IN ('succeeded','partial') and asks for the most recent
    // startedAt. Without this index every chunk pays a per-integration sort.
    index("CoexistSyncRun_integration_resume_idx")
      .on(t.integrationId, t.channel, sql`${t.startedAt} DESC`)
      .where(sql`status IN ('succeeded', 'partial')`),
  ],
)
