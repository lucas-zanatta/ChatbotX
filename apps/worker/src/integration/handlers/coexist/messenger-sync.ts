import { extractContactInfo } from "@chatbotx.io/business"
import {
  and,
  db,
  eq,
  findOrFail,
  lt,
  ne,
  or,
  sql,
} from "@chatbotx.io/database/client"
import { coexistSyncRunModel, inboxModel } from "@chatbotx.io/database/schema"
import {
  listConversations,
  listMessages,
} from "@chatbotx.io/integration-messenger/apis/sync"
import {
  type BucUsage,
  concurrencyForUsage,
} from "@chatbotx.io/integration-messenger/apis/usage"
import type { IncomingContact } from "@chatbotx.io/sdk"
import {
  IntegrationJobAction,
  type IntegrationJobCoexistMessengerSync,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import pLimit from "p-limit"
import { z } from "zod"
import { logger } from "../../../lib/logger"
import {
  bulkImportHistorical,
  type HistoricalContactMessages,
} from "./bulk-historical-import"

const messengerAuthSchema = z
  .object({
    tokens: z.object({ accessToken: z.string() }).passthrough(),
    metadata: z
      .object({ version: z.string().optional() })
      .passthrough()
      .optional(),
  })
  .passthrough()

const WHITESPACE_RE = /\s+/

/**
 * Split a Messenger participant `name` ("Bob Customer") into firstName +
 * lastName. First whitespace token = firstName, remainder = lastName.
 * Single-token names yield `lastName: undefined`. DB `fullName` is a
 * generated column (`firstName || ' ' || lastName`) — no need to persist it.
 */
const splitName = (
  raw: string | undefined,
): { firstName?: string; lastName?: string } => {
  const trimmed = raw?.trim()
  if (!trimmed) {
    return {}
  }
  const idx = trimmed.search(WHITESPACE_RE)
  if (idx < 0) {
    return { firstName: trimmed }
  }
  return {
    firstName: trimmed.slice(0, idx),
    lastName: trimmed.slice(idx).trim() || undefined,
  }
}

/** Default Graph concurrency when BUC usage signals "plenty of budget". */
const DEFAULT_CONCURRENCY = 5

/**
 * Only store messages whose `created_time` is within this window. Older
 * messages are still scanned for phone/email discovery but not persisted.
 * 90 days ≈ 3 months — matches the product spec.
 */
const STORE_WINDOW_MS = 90 * 24 * 60 * 60 * 1000

/** Maximum inline retry attempts on 429 / 5xx before propagating. */
const MAX_INLINE_RETRIES = 4

/**
 * Active wall-time budget per chunk. When exceeded, the job persists state and
 * either hot-chains a continuation enqueue or yields to the scheduler.
 *
 * Sized so the BullMQ lock (10 min) safely covers chunk + tail + safety.
 */
const CHUNK_BUDGET_MS = 4 * 60 * 1000

/** Returns true if the error is an HTTP status we should retry inline. */
function isRetryable(error: unknown): boolean {
  if (
    error != null &&
    typeof error === "object" &&
    "response" in error &&
    error.response != null &&
    typeof error.response === "object" &&
    "status" in error.response &&
    typeof error.response.status === "number"
  ) {
    const status = error.response.status
    return status === 429 || status >= 500
  }
  return false
}

/**
 * Wraps a Graph API call with inline retry on 429 / 5xx. Preserves the
 * pagination cursor across retries — unlike a BullMQ-level retry which would
 * restart the entire job from scratch.
 */
async function withInlineRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < MAX_INLINE_RETRIES; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (!isRetryable(error)) {
        throw error
      }
      const delay = Math.min(2 ** attempt * 1000, 30_000)
      logger.warn(
        { attempt, delay },
        "[coexist] Messenger Graph rate-limited — retrying after delay",
      )
      await new Promise<void>((resolve) => setTimeout(resolve, delay))
    }
  }
  throw lastError
}

/**
 * Resolves the per-integration resume ceiling from the most recent prior
 * `CoexistSyncRun` row. Excludes the current run.
 *
 * Returned ceiling is compared against *message* `created_time` in the
 * per-message loop (not conv updated_time) because the prior run wrote
 * message rows up to that boundary.
 *
 * - status === 'succeeded' → ceiling = priorRun.startedAt — prior run
 *   covered every message that existed up to its start. `startedAt` is set
 *   once per run (COALESCE) so this is the FIRST chunk's start, not a later
 *   chunk's — preserves the invariant that nothing newer than that boundary
 *   was missed.
 * - status === 'partial'   → ceiling = priorRun.lastSyncedAt ?? startedAt
 *   (resume from the boundary the prior attempt reached). lastSyncedAt is
 *   in CONV-TIME but we treat it as a safe lower bound for messages too —
 *   every message in a conv has created_time <= conv.updated_time, so
 *   skipping messages <= lastSyncedAt can only skip messages the prior run
 *   already processed.
 *
 * Returns null when this is the first run for the integration.
 */
async function fetchPriorRunCeiling(
  integrationId: string,
  currentRunId: string,
): Promise<Date | null> {
  const priorRun = await db.query.coexistSyncRunModel.findFirst({
    where: {
      integrationId,
      channel: "messenger",
      status: { in: ["succeeded", "partial"] },
      id: { ne: currentRunId },
    },
    orderBy: { startedAt: "desc" },
    columns: { startedAt: true, lastSyncedAt: true, status: true },
  })
  if (!priorRun) {
    return null
  }
  if (priorRun.status === "succeeded") {
    return priorRun.startedAt ?? null
  }
  return priorRun.lastSyncedAt ?? priorRun.startedAt ?? null
}

/**
 * Page-per-job historical Messenger sync. Each invocation walks the Graph
 * `/me/conversations` list newest-first and uses timestamp watermarks to
 * resume — no Graph cursor is persisted between chunks, which makes the
 * job robust to Page access-token rotation (cursors would 400 after rotate).
 *
 * Resume model:
 *  - **frontier** = `runRow.lastSyncedAt` — oldest message.created_time this
 *    run has processed across prior chunks. Convs with `updated_time` newer
 *    than frontier were already enumerated and processed; skip them.
 *  - **ceiling**  = derived from the prior `CoexistSyncRun` row for this
 *    integration (see {@link fetchPriorRunCeiling}). Convs and messages
 *    `<=` ceiling were imported by an earlier run; skip storage AND
 *    extraction.
 *
 * Idempotent via `Message_(contactInboxId, sourceId)_key` — even when the
 * watermarks are off by a hair, retries never duplicate rows.
 */
export const coexistMessengerSync = async (
  data: IntegrationJobCoexistMessengerSync["data"],
): Promise<void> => {
  const { runId, integrationId, workspaceId } = data
  const jobStart = Date.now()

  const failRun = async (currentError: string): Promise<void> => {
    await db
      .update(coexistSyncRunModel)
      .set({
        status: "failed",
        currentError,
        finishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(coexistSyncRunModel.id, runId))
  }

  const integration = await db.query.integrationMessengerModel.findFirst({
    where: { id: integrationId },
  })
  if (!integration) {
    logger.warn({ integrationId }, "[coexist] Messenger integration gone")
    await failRun("Messenger integration not found")
    return
  }
  if (integration.workspaceId !== workspaceId) {
    logger.warn(
      { integrationId, workspaceId, rowWorkspaceId: integration.workspaceId },
      "[coexist] Messenger sync workspaceId mismatch — refusing",
    )
    await failRun("workspaceId mismatch between integration and run")
    return
  }
  if (!integration.coexistEnabled) {
    logger.info(
      { integrationId },
      "[coexist] Messenger sync skipped — disabled",
    )
    await failRun("Coexist disabled on integration")
    return
  }

  const parsedAuth = messengerAuthSchema.safeParse(integration.auth)
  if (!parsedAuth.success) {
    logger.error(
      { integrationId, error: parsedAuth.error.message },
      "[coexist] Messenger auth jsonb failed validation",
    )
    await failRun(`Messenger auth invalid: ${parsedAuth.error.message}`)
    return
  }
  const accessToken = parsedAuth.data.tokens.accessToken
  const version = parsedAuth.data.metadata?.version
  const { pageId } = integration

  const inbox = await findOrFail({
    table: inboxModel,
    where: { id: integration.inboxId },
    message: "Inbox not found",
  })

  // Default region for phone-number extraction from message bodies. Falls back
  // to the extractor's built-in region list when null.
  const workspace = await db.query.workspaceModel.findFirst({
    where: { id: workspaceId },
    columns: { targetCountry: true },
  })
  const defaultCountry = workspace?.targetCountry ?? null

  // Cutoff for message storage. Computed once per job invocation — a long
  // multi-chunk sync naturally slides the cutoff forward across resumes.
  const cutoff = new Date(Date.now() - STORE_WINDOW_MS)

  // ── Read resume state ─────────────────────────────────────────────────────
  const [runRow] = await db
    .select({
      lastSyncedAt: coexistSyncRunModel.lastSyncedAt,
      attempts: coexistSyncRunModel.attempts,
      importedContactCount: coexistSyncRunModel.importedContactCount,
      importedMessageCount: coexistSyncRunModel.importedMessageCount,
      skippedCount: coexistSyncRunModel.skippedCount,
      failedCount: coexistSyncRunModel.failedCount,
      currentScan: coexistSyncRunModel.currentScan,
      currentError: coexistSyncRunModel.currentError,
    })
    .from(coexistSyncRunModel)
    .where(eq(coexistSyncRunModel.id, runId))
    .limit(1)

  if (!runRow) {
    logger.warn({ runId }, "[coexist] CoexistSyncRun row gone — abandoning")
    return
  }

  // Within-run frontier (oldest CONVERSATION.updated_time processed in earlier
  // chunks of this run) and cross-run ceiling (boundary set by the prior run).
  //
  // IMPORTANT: frontier is in CONVERSATION-TIME space (matches conv.updated_time
  // that Graph DESC-sorts on). Ceiling stays in MESSAGE-TIME space because the
  // prior run wrote message rows up to that boundary.
  const frontier: Date | null = runRow.lastSyncedAt ?? null
  const ceiling: Date | null = await fetchPriorRunCeiling(integrationId, runId)
  let oldestConvProcessed: Date | null = frontier

  let importedContacts = runRow.importedContactCount
  let importedMessages = runRow.importedMessageCount
  let skipped = runRow.skippedCount
  let failed = runRow.failedCount
  let conversationCount = runRow.currentScan
  const attempts = runRow.attempts

  // Optimistic claim: only one worker may flip status→running at a time. The
  // OR on stale lastHeartbeatAt recovers crashed workers after 10 minutes
  // (matches the BullMQ default job-lock duration). If the claim fails the
  // run is already owned by a live worker; abandon this invocation so the
  // counters and watermark aren't double-written.
  const claimed = await db
    .update(coexistSyncRunModel)
    .set({
      status: "running",
      startedAt: sql`COALESCE(${coexistSyncRunModel.startedAt}, NOW())`,
      lastHeartbeatAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(coexistSyncRunModel.id, runId),
        or(
          ne(coexistSyncRunModel.status, "running"),
          lt(
            coexistSyncRunModel.lastHeartbeatAt,
            sql`NOW() - INTERVAL '10 minutes'`,
          ),
        ),
      ),
    )
    .returning({ id: coexistSyncRunModel.id })

  if (claimed.length === 0) {
    logger.warn(
      { runId, integrationId },
      "[coexist] Messenger run already claimed by another worker — abandoning",
    )
    return
  }

  // ── Adaptive concurrency state (BUC-driven) ───────────────────────────────
  let currentConcurrency = DEFAULT_CONCURRENCY
  let currentLimit = pLimit(currentConcurrency)
  let pauseUntil = 0

  const applyBucThrottle = (usage: BucUsage | null | undefined): void => {
    const next = concurrencyForUsage(usage ?? null)
    if (next === 0) {
      const waitSec = usage?.estimatedTimeToRegainAccess ?? 60
      pauseUntil = Math.max(pauseUntil, Date.now() + waitSec * 1000)
      // Collapse concurrency to 1 so post-pause traffic drains serially
      // instead of all in-flight tasks firing at once and re-exhausting BUC.
      if (currentConcurrency !== 1) {
        currentConcurrency = 1
        currentLimit = pLimit(1)
      }
      logger.warn(
        { waitSec, integrationId },
        "[coexist] BUC budget exhausted — pausing Graph calls",
      )
      return
    }
    if (next !== currentConcurrency) {
      currentConcurrency = next
      currentLimit = pLimit(next)
      logger.info(
        { next, integrationId },
        "[coexist] BUC throttle adjusted Messenger concurrency",
      )
    }
  }

  const respectPause = async (): Promise<void> => {
    if (Date.now() < pauseUntil) {
      await new Promise<void>((resolve) =>
        setTimeout(resolve, pauseUntil - Date.now()),
      )
    }
  }

  let finalStatus: "succeeded" | "failed" | "partial" | null = null
  // Carry prior attempt's error so retry doesn't wipe it. New errors during
  // this attempt will overwrite via the per-page UPDATE.
  let finalError: string | undefined = runRow.currentError ?? undefined
  let continueLater = false

  try {
    // Chunk-local pagination cursor. NOT persisted between chunks — each
    // chunk re-walks /conversations DESC from newest and skips via timestamps.
    let pageCursor: string | undefined
    let pageNumber = 0
    let stopAll = false

    // Process pages until budget exhausted, ceiling hit, or no more pages.
    while (true) {
      // Budget check BEFORE fetching next page (so we don't waste a Graph call
      // when we'd just yield right after).
      if (Date.now() - jobStart >= CHUNK_BUDGET_MS) {
        continueLater = true
        break
      }

      await respectPause()

      pageNumber += 1

      const conversations = await withInlineRetry(() =>
        listConversations({
          pageId,
          accessToken,
          version,
          after: pageCursor,
        }),
      )
      applyBucThrottle(conversations.bucUsage)

      await db
        .update(coexistSyncRunModel)
        .set({
          currentStep: `page ${pageNumber} — ${conversations.data.length} conversations`,
          lastHeartbeatAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(coexistSyncRunModel.id, runId))

      // Apply frontier (skip done) + ceiling (stop walk) filters at the
      // conversation level before paying for /messages calls.
      const convsToProcess: typeof conversations.data = []
      for (const conv of conversations.data) {
        const convTime = conv.updated_time ? new Date(conv.updated_time) : null

        // Defensive: Graph occasionally omits updated_time. Treat missing as
        // "must process" (the alternative — silent skip — has caused data
        // loss in the past) and log so we can detect API drift over time.
        if (!convTime) {
          logger.warn(
            { convId: conv.id, integrationId },
            "[coexist] Messenger conversation missing updated_time — processing without watermark filter",
          )
          convsToProcess.push(conv)
          continue
        }

        // Cross-run boundary — Graph returns DESC by updated_time, so once
        // we cross the ceiling there is nothing newer below.
        if (ceiling && convTime <= ceiling) {
          stopAll = true
          break
        }

        // Within-run skip — this conv was fully processed in an earlier chunk
        // of THIS run. Graph DESC ordering guarantees that any conv strictly
        // newer than the frontier was already enumerated. Strict `>` so the
        // boundary conv (== frontier, Graph timestamps are second-precision
        // and can collide) re-enters — idempotency dedups any double-process.
        if (frontier && convTime > frontier) {
          continue
        }

        convsToProcess.push(conv)
      }

      // Fetch messages per conversation under adaptive concurrency.
      // Each callback returns a tuple of (outcome, convTime) — collecting
      // the conv-time into the return value rather than mutating
      // `oldestConvProcessed` from inside concurrent callbacks avoids a
      // read-modify-write race.
      type ConvOutcome = {
        result: HistoricalContactMessages | "FAILED" | "SKIPPED"
        convTime: Date | null
      }
      const outcomes = await Promise.all(
        convsToProcess.map((conv) =>
          currentLimit(async (): Promise<ConvOutcome> => {
            const convTime = conv.updated_time
              ? new Date(conv.updated_time)
              : null
            try {
              const participant = conv.participants?.data?.find(
                (entry) => entry.id !== pageId,
              )
              if (!participant) {
                return { result: "SKIPPED", convTime: null }
              }
              const { firstName, lastName } = splitName(participant.name)

              // Discovery state — sourced ONLY from message bodies.
              // `participants[].email` is unreliable (often a Facebook-internal
              // alias rather than the user's real email) so we ignore it.
              const discovered: {
                phoneNumber?: string
                email?: string
              } = {}

              const recentMessages: HistoricalContactMessages["messages"] = []
              let messageCursor: string | undefined
              let hitOlderBoundary = false

              while (true) {
                await respectPause()
                const page = await withInlineRetry(() =>
                  listMessages({
                    conversationId: conv.id,
                    accessToken,
                    version,
                    after: messageCursor,
                  }),
                )
                applyBucThrottle(page.bucUsage)
                for (const m of page.data) {
                  if (!m.message) {
                    continue
                  }
                  const createdAt = m.created_time
                    ? new Date(m.created_time)
                    : new Date()

                  // Skip messages older than the prior-run ceiling — already
                  // imported. Stops storage AND extraction.
                  if (ceiling && createdAt <= ceiling) {
                    hitOlderBoundary = true
                    continue
                  }

                  // Per-field discovery scan. Once a field is found, skip its
                  // extractor on every subsequent message in this conv —
                  // libphonenumber is the dominant CPU cost.
                  const needsPhone = !discovered.phoneNumber
                  const needsEmail = !discovered.email
                  if (needsPhone || needsEmail) {
                    const ex = extractContactInfo(m.message, defaultCountry, {
                      skipPhone: !needsPhone,
                      skipEmail: !needsEmail,
                    })
                    if (ex.phoneNumber && needsPhone) {
                      discovered.phoneNumber = ex.phoneNumber
                    }
                    if (ex.email && needsEmail) {
                      discovered.email = ex.email
                    }
                  }

                  if (createdAt >= cutoff) {
                    recentMessages.push({
                      sourceId: m.id,
                      messageType:
                        m.from?.id === pageId ? "outgoing" : "incoming",
                      contentType: "text",
                      text: m.message,
                      createdAt,
                    })
                  } else {
                    hitOlderBoundary = true
                  }
                }

                messageCursor = page.after
                if (!messageCursor) {
                  break
                }

                // After consuming a page, decide whether to continue paginating.
                // Once we cross >3mo territory, stop only when BOTH fields are
                // discovered — otherwise keep scanning older purely to satisfy
                // the missing field's discovery. (`&&`, not `||`: a single
                // discovered field is insufficient.)
                if (
                  hitOlderBoundary &&
                  discovered.phoneNumber &&
                  discovered.email
                ) {
                  break
                }
              }

              const contact: IncomingContact = {
                sourceId: participant.id,
                firstName,
                lastName,
                email: discovered.email,
                phoneNumber: discovered.phoneNumber,
              }

              return {
                result: { contact, messages: recentMessages },
                convTime,
              }
            } catch (error) {
              const errMsg =
                error instanceof Error ? error.message : "Unknown fetch error"
              logger.error(
                { error, conversationId: conv.id },
                "[coexist] Messenger conversation fetch failed",
              )
              finalError = `conv ${conv.id} fetch failed: ${errMsg}`
              return { result: "FAILED", convTime: null }
            }
          }),
        ),
      )

      // Reduce conv-time min into the run-level watermark AFTER Promise.all
      // settles — single-writer, no race.
      const realBatch: HistoricalContactMessages[] = []
      let fetchFailed = 0
      for (const o of outcomes) {
        if (o.result === "FAILED") {
          fetchFailed += 1
        } else if (o.result !== "SKIPPED") {
          realBatch.push(o.result)
        }
        if (
          o.convTime &&
          (oldestConvProcessed === null || o.convTime < oldestConvProcessed)
        ) {
          oldestConvProcessed = o.convTime
        }
      }

      // Bulk-import one page transactionally.
      let pageResult: Awaited<ReturnType<typeof bulkImportHistorical>>
      try {
        pageResult = await bulkImportHistorical({
          inbox,
          workspaceId: integration.workspaceId,
          runId,
          batch: realBatch,
        })
      } catch (error) {
        const errMsg =
          error instanceof Error ? error.message : "Unknown bulk import error"
        logger.error(
          { error, runId, pageNumber },
          "[coexist] Messenger bulk import threw — page lost",
        )
        const lostMessages = realBatch.reduce(
          (sum, b) => sum + b.messages.length,
          0,
        )
        pageResult = {
          importedContacts: 0,
          importedMessages: 0,
          skippedContacts: 0,
          skippedMessages: 0,
          failedMessages: lostMessages,
          contactInboxIds: new Map<string, string>(),
        }
        // Capture so finally block persists into currentError (not only pino).
        finalError = `page ${pageNumber} bulk import failed: ${errMsg}`
      }

      importedContacts += pageResult.importedContacts
      importedMessages += pageResult.importedMessages
      skipped += pageResult.skippedMessages + pageResult.skippedContacts
      failed += pageResult.failedMessages + fetchFailed
      conversationCount += convsToProcess.length

      // Surface non-throw failure (e.g. workspace cap hit) so currentError is
      // populated even when bulkImportHistorical returns failedMessages > 0
      // without raising. Otherwise UI shows failedCount=N with empty error.
      if (pageResult.failureReason) {
        finalError = `page ${pageNumber}: ${pageResult.failureReason}`
      }

      // Persist progress + frontier (oldest message processed so far) after
      // each page. The next chunk reads `lastSyncedAt` and skips conversations
      // newer than this value.
      await db
        .update(coexistSyncRunModel)
        .set({
          currentScan: conversationCount,
          importedContactCount: importedContacts,
          importedMessageCount: importedMessages,
          skippedCount: skipped,
          failedCount: failed,
          lastSyncedAt: oldestConvProcessed,
          currentStep: `page ${pageNumber} processed`,
          currentError: finalError ?? null,
          lastHeartbeatAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(coexistSyncRunModel.id, runId))

      pageCursor = conversations.after

      // No more Graph pages OR we crossed the prior-run ceiling → sync done.
      if (!pageCursor || stopAll) {
        if (failed > 0 && (importedMessages > 0 || skipped > 0)) {
          finalStatus = "partial"
        } else if (failed > 0) {
          finalStatus = "failed"
        } else {
          finalStatus = "succeeded"
        }
        break
      }
    }

    // Budget exhausted but more pages remain → hot-chain next chunk.
    // Accept null/undefined cursor as "resume from beginning of remaining pages"
    // (first-invocation timeout case) — without this guard the run gets stuck in
    // status='running' for an hour until heartbeat timeout.
    if (continueLater) {
      try {
        await integrationQueue.add(
          IntegrationJobAction.coexistMessengerSync,
          {
            type: IntegrationJobAction.coexistMessengerSync,
            data: { runId, integrationId, workspaceId },
          },
          {
            jobId: `coexist-run-${runId}-${attempts}-page-${pageNumber + 1}`,
            attempts: 1,
            removeOnComplete: true,
            removeOnFail: { count: 100 },
          },
        )
        logger.info(
          { runId, pageNumber, integrationId },
          "[coexist] Messenger sync chunk done — continuation enqueued",
        )
      } catch (error) {
        // Enqueue failed → fall back to scheduler resume. Mark status=init
        // so the next sweep picks it up; cursor + counters already persisted.
        logger.error(
          { error, runId },
          "[coexist] Messenger continuation enqueue failed — fallback to scheduler",
        )
        await db
          .update(coexistSyncRunModel)
          .set({
            status: "init",
            lastHeartbeatAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(coexistSyncRunModel.id, runId))
      }
    }
  } catch (error) {
    finalStatus = "failed"
    finalError =
      error instanceof Error
        ? error.message
        : "Unknown error during Messenger sync"
    logger.error(error, "[coexist] Messenger sync encountered fatal error")
  } finally {
    if (finalStatus !== null) {
      await db
        .update(coexistSyncRunModel)
        .set({
          status: finalStatus,
          finishedAt: new Date(),
          lastHeartbeatAt: new Date(),
          currentScan: conversationCount,
          currentStep: "done",
          importedContactCount: importedContacts,
          importedMessageCount: importedMessages,
          skippedCount: skipped,
          failedCount: failed,
          currentError: finalError ?? null,
        })
        .where(eq(coexistSyncRunModel.id, runId))
    }
  }

  logger.info(
    {
      integrationId,
      importedContacts,
      importedMessages,
      skipped,
      failed,
      conversations: conversationCount,
      runId,
      finalStatus,
      continued: continueLater,
    },
    "[coexist] Messenger sync chunk complete",
  )
}
