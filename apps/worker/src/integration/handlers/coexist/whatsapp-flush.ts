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
  contactInboxModel,
  inboxModel,
  integrationWhatsappModel,
  messageModel,
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

const waMediaSchema = z
  .object({
    caption: z.string().optional(),
    mime_type: z.string().optional(),
    sha256: z.string().optional(),
    id: z.string().optional(),
    url: z.string().optional(),
  })
  .passthrough()

const waEditSchema = z
  .object({
    original_message_id: z.string(),
    message: z
      .object({
        type: z.string().optional(),
        text: z.object({ body: z.string() }).passthrough().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()

const waRevokeSchema = z
  .object({ original_message_id: z.string() })
  .passthrough()

const waMessageSchema = z
  .object({
    id: z.string(),
    from: z.string().optional(),
    to: z.string().optional(),
    timestamp: z.union([z.string(), z.number()]).optional(),
    type: z.string().optional(),
    text: z.object({ body: z.string() }).passthrough().optional(),
    image: waMediaSchema.optional(),
    video: waMediaSchema.optional(),
    audio: waMediaSchema.optional(),
    document: waMediaSchema.optional(),
    sticker: waMediaSchema.optional(),
    edit: waEditSchema.optional(),
    revoke: waRevokeSchema.optional(),
  })
  .passthrough()

const waThreadSchema = z
  .object({
    id: z.string(),
    messages: z.array(waMessageSchema).optional(),
  })
  .passthrough()

const waHistoryMetadataSchema = z
  .object({
    phase: z.number().optional(),
    chunk_order: z.number().optional(),
    progress: z.number().optional(),
  })
  .passthrough()

const waHistoryErrorSchema = z
  .object({
    code: z.number(),
    title: z.string().optional(),
    message: z.string().optional(),
  })
  .passthrough()

const waHistoryEntrySchema = z
  .object({
    threads: z.array(waThreadSchema).optional(),
    metadata: waHistoryMetadataSchema.optional(),
    errors: z.array(waHistoryErrorSchema).optional(),
  })
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

const waEchoSchema = z
  .object({
    from: z.string(),
    to: z.string(),
    id: z.string(),
    timestamp: z.union([z.string(), z.number()]).optional(),
    type: z.string().optional(),
    text: z.object({ body: z.string() }).passthrough().optional(),
    image: waMediaSchema.optional(),
    video: waMediaSchema.optional(),
    audio: waMediaSchema.optional(),
    document: waMediaSchema.optional(),
    sticker: waMediaSchema.optional(),
  })
  .passthrough()

const waValueSchema = z
  .object({
    contacts: z.array(waContactSchema).optional(),
    history: z.array(waHistoryEntrySchema).optional(),
    smb_app_state_sync: z.array(smbStateSyncEntrySchema).optional(),
    smb_message_echoes: z.array(waEchoSchema).optional(),
    messages: z.array(waMessageSchema).optional(),
  })
  .passthrough()

/** Meta media-type keys carried on a message object. */
const MEDIA_KEYS = ["image", "video", "audio", "document", "sticker"] as const
type MediaKey = (typeof MEDIA_KEYS)[number]

const extractMedia = (
  msg: z.infer<typeof waMessageSchema> | z.infer<typeof waEchoSchema>,
): { fileType: MediaKey; payload: z.infer<typeof waMediaSchema> } | null => {
  for (const key of MEDIA_KEYS) {
    const payload = (msg as Record<string, unknown>)[key]
    if (payload && typeof payload === "object") {
      return {
        fileType: key,
        payload: payload as z.infer<typeof waMediaSchema>,
      }
    }
  }
  return null
}

/** History-decline error code per Meta docs. */
const HISTORY_DECLINED_ERROR_CODE = 2_593_109

type MediaPatch = {
  sourceId: string
  contactWaId: string
  media: {
    fileType: MediaKey
    caption?: string
    mimeType?: string
    sha256?: string
    mediaId?: string
    url?: string
  }
}

type EditPatch = {
  sourceId: string
  contactWaId: string
  text: string | null
  mediaPatch: MediaPatch["media"] | null
}

type RevokePatch = {
  sourceId: string
  contactWaId: string
}

type HistoryMetadata = {
  phase: number
  chunkOrder: number
  progress: number
}

type ExtractResult = {
  entries: ContactWithMessage[]
  mediaPatches: MediaPatch[]
  edits: EditPatch[]
  revokes: RevokePatch[]
  declined: boolean
  metadata: HistoryMetadata | null
}

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

const EMPTY_EXTRACT: ExtractResult = {
  entries: [],
  mediaPatches: [],
  edits: [],
  revokes: [],
  declined: false,
  metadata: null,
}

const mediaFromPayload = (
  fileType: MediaKey,
  payload: z.infer<typeof waMediaSchema>,
): MediaPatch["media"] => ({
  fileType,
  caption: payload.caption,
  mimeType: payload.mime_type,
  sha256: payload.sha256,
  mediaId: payload.id,
  url: payload.url,
})

/**
 * Extracts contacts + historical messages + post-batch patches from one
 * buffered `changes[].value` slice.
 *
 * Group chats are not synced by WhatsApp Coexistence, so every thread here is
 * a 1:1 conversation keyed by the customer `wa_id`.
 *
 * Five Meta payload shapes are recognized:
 *   - `value.history[].threads[]`            → historical text/media messages
 *   - `value.history[].errors[code=2593109]` → history-sharing declined
 *   - `value.history[].metadata`             → phase/chunk_order/progress
 *   - `value.smb_app_state_sync[]`           → contact backfill
 *   - `value.smb_message_echoes[]`           → outgoing messages from WA Business app
 *   - `value.messages[]`                     → media-asset follow-up / edit / revoke
 */
const extractFromValue = (payload: unknown): ExtractResult => {
  const parsed = waValueSchema.safeParse(payload)
  if (!parsed.success) {
    logger.warn(
      { error: parsed.error.message },
      "[coexist] Unrecognized WhatsApp history payload — skipped",
    )
    return EMPTY_EXTRACT
  }
  const value = parsed.data

  const nameByWaId = new Map<string, string>()
  for (const contact of value.contacts ?? []) {
    if (contact.profile?.name) {
      nameByWaId.set(contact.wa_id, contact.profile.name)
    }
  }

  const entries: ContactWithMessage[] = []
  const mediaPatches: MediaPatch[] = []
  const edits: EditPatch[] = []
  const revokes: RevokePatch[] = []
  let declined = false
  let metadata: HistoryMetadata | null = null

  for (const entry of value.history ?? []) {
    if (entry.errors?.some((e) => e.code === HISTORY_DECLINED_ERROR_CODE)) {
      declined = true
    }
    if (entry.metadata) {
      const phase = entry.metadata.phase ?? 0
      const chunkOrder = entry.metadata.chunk_order ?? 0
      const progress = entry.metadata.progress ?? 0
      if (
        metadata === null ||
        progress > metadata.progress ||
        chunkOrder > metadata.chunkOrder
      ) {
        metadata = { phase, chunkOrder, progress }
      }
    }

    for (const thread of entry.threads ?? []) {
      const customerWaId = thread.id
      const contact: IncomingContact = {
        sourceId: customerWaId,
        phoneNumber: customerWaId,
        firstName: nameByWaId.get(customerWaId),
      }

      const messages = thread.messages ?? []
      if (messages.length === 0) {
        entries.push({ contact, message: null })
        continue
      }

      for (const message of messages) {
        const isOutgoing = message.from !== customerWaId
        const text =
          message.text?.body ?? (message.type ? `[${message.type}]` : "")
        entries.push({
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
    entries.push({
      contact: {
        sourceId: phone,
        phoneNumber: phone,
        firstName: entry.contact.first_name ?? entry.contact.full_name,
      },
      message: null,
    })
  }

  for (const echo of value.smb_message_echoes ?? []) {
    const customerWaId = echo.to
    const contact: IncomingContact = {
      sourceId: customerWaId,
      phoneNumber: customerWaId,
      firstName: nameByWaId.get(customerWaId),
    }
    const text = echo.text?.body ?? (echo.type ? `[${echo.type}]` : "")
    entries.push({
      contact,
      message: {
        sourceId: echo.id,
        messageType: "outgoing",
        contentType: "text",
        text,
        createdAt: toDate(echo.timestamp),
      },
    })

    const media = extractMedia(echo)
    if (media) {
      mediaPatches.push({
        sourceId: echo.id,
        contactWaId: customerWaId,
        media: mediaFromPayload(media.fileType, media.payload),
      })
    }
  }

  for (const message of value.messages ?? []) {
    if (message.type === "revoke" || message.revoke) {
      const original = message.revoke?.original_message_id
      const contactWaId = message.from
      if (original && contactWaId) {
        revokes.push({ sourceId: original, contactWaId })
      }
      continue
    }
    if (message.type === "edit" || message.edit) {
      const original = message.edit?.original_message_id
      const contactWaId = message.from
      if (!(original && contactWaId)) {
        continue
      }
      const editedText = message.edit?.message?.text?.body ?? null
      const editedMediaSource = message.edit?.message as
        | z.infer<typeof waMessageSchema>
        | undefined
      const editedMedia = editedMediaSource
        ? extractMedia(editedMediaSource)
        : null
      edits.push({
        sourceId: original,
        contactWaId,
        text: editedText,
        mediaPatch: editedMedia
          ? mediaFromPayload(editedMedia.fileType, editedMedia.payload)
          : null,
      })
      continue
    }

    const media = extractMedia(message)
    if (media && message.from) {
      mediaPatches.push({
        sourceId: message.id,
        contactWaId: message.from,
        media: mediaFromPayload(media.fileType, media.payload),
      })
    }
  }

  return { entries, mediaPatches, edits, revokes, declined, metadata }
}

/**
 * Resolves a set of customer wa_ids to their ContactInbox rows for this inbox.
 * Returns a Map keyed by sourceId (= wa_id). Missing keys mean either Meta
 * delivered a media follow-up before the history insert (next chunk picks it
 * up) or the contact was cap-rejected by bulkImportHistorical.
 */
const resolveContactInboxIds = async (
  inboxId: string,
  contactWaIds: string[],
): Promise<Map<string, string>> => {
  const ids = new Map<string, string>()
  if (contactWaIds.length === 0) {
    return ids
  }
  const uniq = Array.from(new Set(contactWaIds))
  const rows = await db
    .select({
      id: contactInboxModel.id,
      sourceId: contactInboxModel.sourceId,
    })
    .from(contactInboxModel)
    .where(
      and(
        eq(contactInboxModel.inboxId, inboxId),
        inArray(contactInboxModel.sourceId, uniq),
      ),
    )
  for (const row of rows) {
    if (row.sourceId) {
      ids.set(row.sourceId, row.id)
    }
  }
  return ids
}

/**
 * Applies the three post-batch patch families that bulkImportHistorical cannot
 * express (insert-only contract):
 *
 *   - Media follow-ups → UPDATE messageModel.contentAttributes with the resolved
 *     mediaId/mimeType/caption/url. Idempotent — the placeholder text row stays.
 *   - Edits → UPDATE text and merge `edited: true` into contentAttributes.
 *   - Revokes → merge `revoked: true` into contentAttributes (text retained).
 *
 * Lookups are scoped by (contactInboxId, sourceId) — Message's natural key.
 */
const applyPostBatchPatches = async (input: {
  inboxId: string
  mediaPatches: MediaPatch[]
  edits: EditPatch[]
  revokes: RevokePatch[]
}): Promise<void> => {
  const { inboxId, mediaPatches, edits, revokes } = input
  if (mediaPatches.length === 0 && edits.length === 0 && revokes.length === 0) {
    return
  }
  const allWaIds = [
    ...mediaPatches.map((p) => p.contactWaId),
    ...edits.map((p) => p.contactWaId),
    ...revokes.map((p) => p.contactWaId),
  ]
  const contactInboxIdByWaId = await resolveContactInboxIds(inboxId, allWaIds)

  const mergeJsonb = (overlay: Record<string, unknown>) =>
    sql`COALESCE(${messageModel.contentAttributes}, '{}'::jsonb) || ${JSON.stringify(overlay)}::jsonb`

  for (const patch of mediaPatches) {
    const contactInboxId = contactInboxIdByWaId.get(patch.contactWaId)
    if (!contactInboxId) {
      continue
    }
    await db
      .update(messageModel)
      .set({
        contentAttributes: mergeJsonb({ media: patch.media }),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(messageModel.contactInboxId, contactInboxId),
          eq(messageModel.sourceId, patch.sourceId),
        ),
      )
  }

  for (const patch of edits) {
    const contactInboxId = contactInboxIdByWaId.get(patch.contactWaId)
    if (!contactInboxId) {
      continue
    }
    const overlay: Record<string, unknown> = { edited: true }
    if (patch.mediaPatch) {
      overlay.media = patch.mediaPatch
    }
    await db
      .update(messageModel)
      .set({
        ...(patch.text === null ? {} : { text: patch.text }),
        contentAttributes: mergeJsonb(overlay),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(messageModel.contactInboxId, contactInboxId),
          eq(messageModel.sourceId, patch.sourceId),
        ),
      )
  }

  for (const patch of revokes) {
    const contactInboxId = contactInboxIdByWaId.get(patch.contactWaId)
    if (!contactInboxId) {
      continue
    }
    await db
      .update(messageModel)
      .set({
        contentAttributes: mergeJsonb({ revoked: true }),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(messageModel.contactInboxId, contactInboxId),
          eq(messageModel.sourceId, patch.sourceId),
        ),
      )
  }
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

      // Flatten + coalesce per sourceId across rows in this batch. Also
      // accumulate post-batch patches (media follow-ups, edits, revokes),
      // a decline flag, and the highest-progress history metadata seen.
      const rowGroups = new Map<string, { entries: ContactWithMessage[] }>()
      const batchMediaPatches: MediaPatch[] = []
      const batchEdits: EditPatch[] = []
      const batchRevokes: RevokePatch[] = []
      let batchDeclined = false
      let batchMetadata: HistoryMetadata | null = null
      for (const row of stagedRows) {
        const extracted = extractFromValue(row.payload)
        for (const e of extracted.entries) {
          if (!e.contact.sourceId) {
            continue
          }
          const group = rowGroups.get(e.contact.sourceId) ?? { entries: [] }
          group.entries.push(e)
          rowGroups.set(e.contact.sourceId, group)
        }
        batchMediaPatches.push(...extracted.mediaPatches)
        batchEdits.push(...extracted.edits)
        batchRevokes.push(...extracted.revokes)
        if (extracted.declined) {
          batchDeclined = true
        }
        if (extracted.metadata) {
          const m = extracted.metadata
          if (
            batchMetadata === null ||
            m.progress > batchMetadata.progress ||
            m.chunkOrder > batchMetadata.chunkOrder
          ) {
            batchMetadata = m
          }
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

      // Apply post-batch patches (media follow-ups, edits, revokes). These
      // target rows already inserted by bulkImportHistorical (or by an earlier
      // batch). Patches that cannot resolve a contactInboxId are silently
      // dropped — Meta sometimes delivers a media follow-up before the
      // history insert, and the next chunk's UPDATE will pick it up.
      await applyPostBatchPatches({
        inboxId: integration.inboxId,
        mediaPatches: batchMediaPatches,
        edits: batchEdits,
        revokes: batchRevokes,
      })

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
          ...(batchMetadata
            ? {
                lastPhase: batchMetadata.phase,
                lastChunkOrder: batchMetadata.chunkOrder,
                syncProgress: batchMetadata.progress,
              }
            : {}),
        })
        .where(eq(coexistSyncRunModel.id, runId))

      // History-decline short-circuit: user declined chat-history sharing in
      // the WA Business app. Mark integration so UI hides retry CTA, then
      // finish the run as succeeded (no data loss — there is nothing to
      // import) with a sentinel `currentError` for the UI to read.
      if (batchDeclined) {
        await db
          .update(integrationWhatsappModel)
          .set({ historyDeclined: true, updatedAt: new Date() })
          .where(eq(integrationWhatsappModel.id, integration.id))
        finalStatus = "succeeded"
        finalError = "history_declined"
        exhausted = true
        break
      }

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
