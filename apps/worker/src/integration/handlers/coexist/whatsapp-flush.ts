import {
  and,
  db,
  eq,
  findOrFail,
  inArray,
  isNull,
  lt,
  ne,
  or,
  sql,
} from "@chatbotx.io/database/client"
import {
  coexistSyncRunModel,
  inboxModel,
  whatsappCoexistStagingModel,
} from "@chatbotx.io/database/schema"
import type { IncomingContact, IncomingMessage } from "@chatbotx.io/sdk"
import {
  IntegrationJobAction,
  type IntegrationJobCoexistWhatsappFlush,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { z } from "zod"
import { logger } from "../../../lib/logger"
import {
  bulkImportHistorical,
  type HistoricalContactMessages,
} from "./bulk-historical-import"

/**
 * WhatsApp Coexistence webhook payloads are loosely documented. Schemas are
 * intentionally permissive (`.passthrough()`, optional fields) — unrecognized
 * shapes are skipped rather than crashing the flush job.
 */
const waProfileSchema = z.object({ name: z.string().optional() }).passthrough()

const waContactSchema = z
  .object({ wa_id: z.string(), profile: waProfileSchema.optional() })
  .passthrough()

const waMessageSchema = z
  .object({
    id: z.string(),
    from: z.string().optional(),
    timestamp: z.union([z.string(), z.number()]).optional(),
    type: z.string().optional(),
    text: z.object({ body: z.string() }).passthrough().optional(),
  })
  .passthrough()

const waThreadSchema = z
  .object({
    id: z.string(),
    messages: z.array(waMessageSchema).optional(),
  })
  .passthrough()

const waHistoryEntrySchema = z
  .object({ threads: z.array(waThreadSchema).optional() })
  .passthrough()

const smbStateSyncEntrySchema = z
  .object({
    type: z.string().optional(),
    action: z.string().optional(),
    contact: z
      .object({
        phone_number: z.string().optional(),
        full_name: z.string().optional(),
        first_name: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()

const waValueSchema = z
  .object({
    contacts: z.array(waContactSchema).optional(),
    history: z.array(waHistoryEntrySchema).optional(),
    smb_app_state_sync: z.array(smbStateSyncEntrySchema).optional(),
  })
  .passthrough()

type ContactWithMessage = {
  contact: IncomingContact
  message: (IncomingMessage & { createdAt?: Date }) | null
}

const toDate = (timestamp: string | number | undefined): Date => {
  if (timestamp === undefined) {
    return new Date()
  }
  const seconds = Number(timestamp)
  return Number.isFinite(seconds) ? new Date(seconds * 1000) : new Date()
}

/**
 * Extracts contacts + historical messages from one buffered `changes[].value`
 * slice. Group chats are not synced by WhatsApp Coexistence, so every thread
 * here is a 1:1 conversation keyed by the customer `wa_id`.
 */
const extractFromValue = (payload: unknown): ContactWithMessage[] => {
  const parsed = waValueSchema.safeParse(payload)
  if (!parsed.success) {
    logger.warn(
      { error: parsed.error.message },
      "[coexist] Unrecognized WhatsApp history payload — skipped",
    )
    return []
  }
  const value = parsed.data

  const nameByWaId = new Map<string, string>()
  for (const contact of value.contacts ?? []) {
    if (contact.profile?.name) {
      nameByWaId.set(contact.wa_id, contact.profile.name)
    }
  }

  const results: ContactWithMessage[] = []

  for (const entry of value.history ?? []) {
    for (const thread of entry.threads ?? []) {
      const customerWaId = thread.id
      const contact: IncomingContact = {
        sourceId: customerWaId,
        phoneNumber: customerWaId,
        firstName: nameByWaId.get(customerWaId),
      }

      const messages = thread.messages ?? []
      if (messages.length === 0) {
        results.push({ contact, message: null })
        continue
      }

      for (const message of messages) {
        const isOutgoing = message.from !== customerWaId
        const text =
          message.text?.body ?? (message.type ? `[${message.type}]` : "")
        results.push({
          contact,
          message: {
            sourceId: message.id,
            messageType: isOutgoing ? "outgoing" : "incoming",
            contentType: "text",
            text,
            createdAt: toDate(message.timestamp),
          },
        })
      }
    }
  }

  for (const entry of value.smb_app_state_sync ?? []) {
    if (entry.action === "remove" || !entry.contact?.phone_number) {
      continue
    }
    const phone = entry.contact.phone_number
    results.push({
      contact: {
        sourceId: phone,
        phoneNumber: phone,
        firstName: entry.contact.first_name ?? entry.contact.full_name,
      },
      message: null,
    })
  }

  return results
}

/** Staging rows processed per chunk. Tuned for ~30s wall-time per chunk. */
const BATCH_SIZE = 100

/**
 * Active wall-time budget per chunk. When exceeded, the job persists state and
 * either hot-chains a continuation enqueue or yields to the scheduler.
 */
const CHUNK_BUDGET_MS = 4 * 60 * 1000

/**
 * Drains buffered WhatsApp staging rows into Contact/ContactInbox/Message via
 * the bulk pipeline. Page-per-job pattern: one chunk per invocation, then
 * either hot-chain a continuation enqueue or yield to the scheduler.
 *
 * Gated by `coexistEnabled` — a no-op when the user has not confirmed the
 * popup. Idempotent: safe to re-run as more history arrives over the ~24h
 * window Meta uses to push it.
 */
export const coexistWhatsappFlush = async (
  data: IntegrationJobCoexistWhatsappFlush["data"],
): Promise<void> => {
  const { runId, phoneNumberId } = data
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

  const integration = await db.query.integrationWhatsappModel.findFirst({
    where: { phoneNumberId },
  })
  if (!integration) {
    logger.warn({ phoneNumberId }, "[coexist] Flush: WhatsApp integration gone")
    await failRun("WhatsApp integration not found")
    return
  }
  if (!integration.coexistEnabled) {
    logger.info(
      { phoneNumberId },
      "[coexist] Flush skipped — coexist disabled, payloads remain staged",
    )
    await failRun("Coexist disabled on integration")
    return
  }

  // ── Read resume state ─────────────────────────────────────────────────────
  const [runRow] = await db
    .select({
      workspaceId: coexistSyncRunModel.workspaceId,
      currentPageNumber: coexistSyncRunModel.currentPageNumber,
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
    logger.warn({ runId }, "[coexist] Flush: CoexistSyncRun row missing")
    return
  }

  // Cross-tenant guard: refuse if integration's workspaceId doesn't match
  // the run's workspaceId (defends against phoneNumberId collisions or
  // stale job payloads referencing a re-assigned integration).
  if (integration.workspaceId !== runRow.workspaceId) {
    logger.warn(
      {
        phoneNumberId,
        runId,
        integrationWorkspaceId: integration.workspaceId,
        runWorkspaceId: runRow.workspaceId,
      },
      "[coexist] Flush: workspaceId mismatch — refusing",
    )
    await failRun("workspaceId mismatch between integration and run")
    return
  }

  const inbox = await findOrFail({
    table: inboxModel,
    where: { id: integration.inboxId },
    message: "Inbox not found",
  })

  let importedContacts = runRow.importedContactCount
  let importedMessages = runRow.importedMessageCount
  let skipped = runRow.skippedCount
  let failed = runRow.failedCount
  let totalRows = runRow.currentScan
  let batchNumber = runRow.currentPageNumber
  const attempts = runRow.attempts

  // Optimistic claim: refuse the run if another worker already owns it
  // (BullMQ manual retry, lock loss, scheduler resume). 10-minute stale
  // heartbeat fallback recovers a crashed prior worker. `startedAt` uses
  // COALESCE so the FIRST chunk's start is preserved across resume — the
  // value is consumed by downstream resume logic as a boundary marker.
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
      { runId, phoneNumberId },
      "[coexist] WhatsApp flush run already claimed by another worker — abandoning",
    )
    return
  }

  let finalStatus: "succeeded" | "failed" | "partial" | null = null
  // Carry prior attempt's error so retry doesn't wipe it. New errors during
  // this attempt will overwrite via the per-batch UPDATE or outer catch.
  let finalError: string | undefined = runRow.currentError ?? undefined
  let continueLater = false
  let exhausted = false

  try {
    while (true) {
      if (Date.now() - jobStart >= CHUNK_BUDGET_MS) {
        continueLater = true
        break
      }

      batchNumber += 1
      await db
        .update(coexistSyncRunModel)
        .set({
          currentStep: `flushing batch ${batchNumber}`,
          lastHeartbeatAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(coexistSyncRunModel.id, runId))

      const stagedRows = await db
        .select()
        .from(whatsappCoexistStagingModel)
        .where(
          and(
            eq(whatsappCoexistStagingModel.phoneNumberId, phoneNumberId),
            isNull(whatsappCoexistStagingModel.processedAt),
          ),
        )
        .limit(BATCH_SIZE)

      if (stagedRows.length === 0) {
        exhausted = true
        break
      }

      // Flatten + coalesce per sourceId across rows in this batch.
      const rowGroups = new Map<string, { entries: ContactWithMessage[] }>()
      for (const row of stagedRows) {
        const extracted = extractFromValue(row.payload)
        for (const e of extracted) {
          if (!e.contact.sourceId) {
            continue
          }
          const group = rowGroups.get(e.contact.sourceId) ?? { entries: [] }
          group.entries.push(e)
          rowGroups.set(e.contact.sourceId, group)
        }
      }

      const flat: HistoricalContactMessages[] = []
      for (const [, group] of rowGroups) {
        // Coalesce contact fields across entries (first non-null wins).
        const merged: IncomingContact = group.entries.reduce<IncomingContact>(
          (acc, e) => ({
            sourceId: acc.sourceId || e.contact.sourceId,
            phoneNumber: acc.phoneNumber ?? e.contact.phoneNumber,
            phoneNumberId: acc.phoneNumberId ?? e.contact.phoneNumberId,
            firstName: acc.firstName ?? e.contact.firstName,
            lastName: acc.lastName ?? e.contact.lastName,
            email: acc.email ?? e.contact.email,
            avatar: acc.avatar ?? e.contact.avatar,
            gender: acc.gender ?? e.contact.gender,
          }),
          { sourceId: "" },
        )
        const messages = group.entries.flatMap((e) =>
          e.message ? [e.message] : [],
        )
        flat.push({ contact: merged, messages })
      }

      let batchResult: Awaited<ReturnType<typeof bulkImportHistorical>>
      try {
        batchResult = await bulkImportHistorical({
          inbox,
          workspaceId: integration.workspaceId,
          runId,
          batch: flat,
        })
      } catch (error) {
        logger.error(
          { error, runId, batchNumber },
          "[coexist] WhatsApp bulk import threw — batch lost",
        )
        // Roll counters: count every message in this batch as failed.
        const lostMessages = flat.reduce((sum, b) => sum + b.messages.length, 0)
        batchResult = {
          importedContacts: 0,
          importedMessages: 0,
          skippedContacts: 0,
          skippedMessages: 0,
          failedMessages: lostMessages,
          contactInboxIds: new Map<string, string>(),
        }
        // Do NOT mark staging rows processed — let scheduler retry the batch.
        importedContacts += batchResult.importedContacts
        importedMessages += batchResult.importedMessages
        skipped += batchResult.skippedMessages + batchResult.skippedContacts
        failed += batchResult.failedMessages
        totalRows += stagedRows.length
        await db
          .update(coexistSyncRunModel)
          .set({
            currentScan: totalRows,
            importedContactCount: importedContacts,
            importedMessageCount: importedMessages,
            skippedCount: skipped,
            failedCount: failed,
            currentPageNumber: batchNumber,
            lastHeartbeatAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(coexistSyncRunModel.id, runId))
        // Break out to status='failed' end-of-run.
        throw error
      }

      importedContacts += batchResult.importedContacts
      importedMessages += batchResult.importedMessages
      skipped += batchResult.skippedMessages + batchResult.skippedContacts
      failed += batchResult.failedMessages
      totalRows += stagedRows.length

      // Surface non-throw failure (e.g. workspace cap hit) so currentError is
      // populated even when bulkImportHistorical returns failedMessages > 0
      // without raising. Otherwise UI shows failedCount=N with empty error.
      if (batchResult.failureReason) {
        finalError = `batch ${batchNumber}: ${batchResult.failureReason}`
      }

      // Mark ALL rows in this batch processed — bulk pipeline was atomic.
      // Cap-rejected contacts also count as "processed" (deterministic skip,
      // re-processing won't recover them).
      await db
        .update(whatsappCoexistStagingModel)
        .set({ processedAt: new Date() })
        .where(
          inArray(
            whatsappCoexistStagingModel.id,
            stagedRows.map((r) => r.id),
          ),
        )

      await db
        .update(coexistSyncRunModel)
        .set({
          currentScan: totalRows,
          importedContactCount: importedContacts,
          importedMessageCount: importedMessages,
          skippedCount: skipped,
          failedCount: failed,
          currentPageNumber: batchNumber,
          currentError: finalError ?? null,
          lastHeartbeatAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(coexistSyncRunModel.id, runId))

      if (stagedRows.length < BATCH_SIZE) {
        exhausted = true
        break
      }
    }

    if (exhausted) {
      if (failed > 0 && (importedMessages > 0 || skipped > 0)) {
        finalStatus = "partial"
      } else if (failed > 0) {
        finalStatus = "failed"
      } else {
        finalStatus = "succeeded"
      }
    }

    if (continueLater && !exhausted) {
      try {
        await integrationQueue.add(
          IntegrationJobAction.coexistWhatsappFlush,
          {
            type: IntegrationJobAction.coexistWhatsappFlush,
            data: { runId, phoneNumberId },
          },
          {
            jobId: `coexist-run-${runId}-${attempts}-page-${batchNumber + 1}`,
            attempts: 1,
            removeOnComplete: true,
            removeOnFail: { count: 100 },
          },
        )
        logger.info(
          { runId, batchNumber, phoneNumberId },
          "[coexist] WhatsApp flush chunk done — continuation enqueued",
        )
      } catch (error) {
        logger.error(
          { error, runId },
          "[coexist] WhatsApp continuation enqueue failed — fallback to scheduler",
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
      error instanceof Error ? error.message : "Unknown error during flush"
    logger.error(error, "[coexist] WhatsApp flush encountered fatal error")
  } finally {
    if (finalStatus !== null) {
      await db
        .update(coexistSyncRunModel)
        .set({
          status: finalStatus,
          finishedAt: new Date(),
          lastHeartbeatAt: new Date(),
          currentScan: totalRows,
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
      phoneNumberId,
      importedContacts,
      importedMessages,
      skipped,
      failed,
      rows: totalRows,
      runId,
      finalStatus,
      continued: continueLater,
    },
    "[coexist] WhatsApp flush chunk complete",
  )
}
