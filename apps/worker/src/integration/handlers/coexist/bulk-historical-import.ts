// biome-ignore-all lint/suspicious/noBitwiseOperators: bit-packing 63-bit snowflake IDs
import { db, inArray, sql } from "@chatbotx.io/database/client"
import {
  contactInboxModel,
  contactModel,
  conversationModel,
  messageModel,
  workspaceUsageModel,
} from "@chatbotx.io/database/schema"
import type { InboxModel } from "@chatbotx.io/database/types"
import { emit } from "@chatbotx.io/event-bus"
import { emitContactCreated } from "@chatbotx.io/events"
import type { IncomingContact, IncomingMessage } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import { logger } from "../../../lib/logger"

// ---------- Coexist time-derived Message IDs ----------
// Layout mirrors `@chatbotx.io/utils` `createId()` shift so coexist IDs share
// the same numeric magnitude/length as live snowflakes:
//   high → low: [ 53 bits ms since epoch ][ 10 bits run partition ][ 4 bits seq ]
//   ts_shift = 14   (identical to uuniq layout)
// Epoch `2026-03-31` matches `createId()`. The high 53 bits being a pure
// function of `createdAt` guarantees `ORDER BY id` ≡ `ORDER BY createdAt` for
// historically-imported rows.
// Partition space = 1024 slots → >100 concurrent workers without collision.
// Seq space = 16 same-ms slots per run → Graph second-precision (1000 ms per
// sec) means 16,000 msgs/sec headroom; overflow scans forward by 1 ms.

const COEXIST_EPOCH_MS = new Date("2026-03-31").getTime()
const COEXIST_TS_BITS = 53n
const COEXIST_PARTITION_BITS = 10n
const COEXIST_SEQ_BITS = 4n
const COEXIST_PARTITION_SHIFT = COEXIST_SEQ_BITS
const COEXIST_TS_SHIFT = COEXIST_PARTITION_BITS + COEXIST_SEQ_BITS
const COEXIST_PARTITION_MASK = (1n << COEXIST_PARTITION_BITS) - 1n
const COEXIST_SEQ_MASK = (1n << COEXIST_SEQ_BITS) - 1n
const COEXIST_MAX_TS = 1n << COEXIST_TS_BITS

export type HistoricalIdFactory = (date: Date) => string

const COEXIST_SEQ_SPACE = 1n << COEXIST_SEQ_BITS

/**
 * Build a per-run factory that mints time-derived IDs for historical Message
 * inserts. The high 41 bits are always derived from `date.getTime()` so that
 * `ORDER BY id` matches `ORDER BY createdAt` regardless of the order in which
 * messages are fed to the factory (Graph APIs typically stream newest-first).
 *
 * For same-ms collisions within one run, a per-ts sequence counter increments
 * monotonically. When the 16-slot sequence space at a given ms is exhausted,
 * we scan forward to the next available ms — this drifts overflowed IDs by a
 * few ms but preserves both monotonicity and the time-order invariant.
 *
 * Cross-run uniqueness comes from the 10-bit partition derived from `runId`
 * (1024 slots > 100 concurrent workers).
 */
export const createHistoricalIdFactory = (
  runId: string,
): HistoricalIdFactory => {
  const partition = BigInt(runId) & COEXIST_PARTITION_MASK
  const seqByTs = new Map<bigint, bigint>()

  return (date: Date): string => {
    const baseTs = BigInt(date.getTime() - COEXIST_EPOCH_MS)
    if (baseTs < 0n || baseTs >= COEXIST_MAX_TS) {
      throw new Error(
        `createHistoricalIdFactory: ${date.toISOString()} out of range`,
      )
    }
    let ts = baseTs
    while (ts < COEXIST_MAX_TS) {
      const next = seqByTs.get(ts) ?? 0n
      if (next < COEXIST_SEQ_SPACE) {
        seqByTs.set(ts, next + 1n)
        return (
          (ts << COEXIST_TS_SHIFT) |
          (partition << COEXIST_PARTITION_SHIFT) |
          next
        ).toString()
      }
      ts += 1n
    }
    throw new Error(
      `createHistoricalIdFactory: exhausted sequence space at ${date.toISOString()}`,
    )
  }
}

export const decodeHistoricalId = (
  id: string,
): { timestampMs: number; partition: number; seq: number } => {
  const v = BigInt(id)
  return {
    timestampMs: Number(v >> COEXIST_TS_SHIFT) + COEXIST_EPOCH_MS,
    partition: Number((v >> COEXIST_PARTITION_SHIFT) & COEXIST_PARTITION_MASK),
    seq: Number(v & COEXIST_SEQ_MASK),
  }
}

const isUniqueMessagePkViolation = (err: unknown): boolean => {
  if (typeof err !== "object" || err === null) {
    return false
  }
  const e = err as { code?: string; constraint_name?: string }
  return e.code === "23505" && e.constraint_name === "Message_pkey"
}

export type HistoricalMessage = IncomingMessage & { createdAt?: Date }

export type HistoricalContactMessages = {
  contact: IncomingContact
  messages: HistoricalMessage[]
}

export type BulkImportResult = {
  importedContacts: number
  importedMessages: number
  skippedContacts: number
  skippedMessages: number
  failedMessages: number
  contactInboxIds: Map<string, string>
  // Non-throw failure reason (e.g. workspace contact cap hit). Set when
  // failedMessages > 0 without an exception so callers can persist it into
  // CoexistSyncRun.currentError instead of leaving it null.
  failureReason?: string
}

type ResolvedEntry = {
  sourceId: string
  contactInboxId: string
  contactId: string
  conversationId: string
}

/**
 * Idempotent bulk import of contacts + messages for one inbox. Used by Coexist
 * historical-sync handlers (Messenger + WhatsApp). Replaces the per-record
 * `upsertContactAndMessage` loop with a transactional batch:
 *
 *   1. Pre-query split: known-new vs already-existing ContactInbox rows.
 *   2. Lock WorkspaceUsage FOR UPDATE; enforce contact cap atomically.
 *   3. Bulk INSERT Contact (no business-key unique index, so pre-query split
 *      is the only safe idempotency strategy here).
 *   4. Bulk INSERT ContactInbox + Conversation with `onConflictDoNothing` as
 *      a backstop for concurrent webhook races.
 *   5. Bulk INSERT Message with `onConflictDoNothing` on
 *      `(contactInboxId, sourceId)`.
 *   6. Post-commit: emit contact-created events. No realtime broadcast — bulk
 *      sync should not flood the inbox UI.
 *
 * Counter semantics:
 *  - `skippedContacts`  — contact hit workspace cap; never created
 *  - `failedMessages`   — messages whose contact was rejected (cap or insert
 *                          conflict-without-resolution)
 *  - `skippedMessages`  — duplicates of already-imported messages
 *  - `importedMessages` — newly inserted Message rows
 */
export const bulkImportHistorical = async (props: {
  inbox: InboxModel
  workspaceId: string
  runId: string
  batch: HistoricalContactMessages[]
}): Promise<BulkImportResult> => {
  const { inbox, workspaceId, runId, batch } = props
  const makeMessageId = createHistoricalIdFactory(runId)

  const empty: BulkImportResult = {
    importedContacts: 0,
    importedMessages: 0,
    skippedContacts: 0,
    skippedMessages: 0,
    failedMessages: 0,
    contactInboxIds: new Map(),
  }
  if (batch.length === 0) {
    return empty
  }

  // Dedup by sourceId — merge messages from later entries, prefer first
  // non-null contact field across entries.
  const dedup = new Map<string, HistoricalContactMessages>()
  for (const entry of batch) {
    const key = entry.contact.sourceId
    if (!key) {
      continue
    }
    const existing = dedup.get(key)
    if (!existing) {
      dedup.set(key, {
        contact: { ...entry.contact },
        messages: [...entry.messages],
      })
      continue
    }
    existing.contact = {
      sourceId: existing.contact.sourceId,
      phoneNumber: existing.contact.phoneNumber ?? entry.contact.phoneNumber,
      phoneNumberId:
        existing.contact.phoneNumberId ?? entry.contact.phoneNumberId,
      firstName: existing.contact.firstName ?? entry.contact.firstName,
      lastName: existing.contact.lastName ?? entry.contact.lastName,
      email: existing.contact.email ?? entry.contact.email,
      avatar: existing.contact.avatar ?? entry.contact.avatar,
      gender: existing.contact.gender ?? entry.contact.gender,
    }
    for (const m of entry.messages) {
      existing.messages.push(m)
    }
  }

  if (dedup.size === 0) {
    return empty
  }

  const sourceIds = [...dedup.keys()]
  const newContactCreatedEvents: Array<{
    workspaceId: string
    contactId: string
    contactInboxId: string
    sourceId: string
    firstName?: string
    phoneNumber?: string
    email?: string
    channel: string
    source: string
    createdAt: Date
  }> = []

  let importedContacts = 0
  let skippedContacts = 0
  let importedMessages = 0
  let skippedMessages = 0
  let failedMessages = 0
  let failureReason: string | undefined
  const contactInboxIds = new Map<string, string>()

  await db.transaction(async (tx) => {
    // 1. Find existing ContactInbox rows for these sourceIds.
    const existingRows = await tx
      .select({
        id: contactInboxModel.id,
        sourceId: contactInboxModel.sourceId,
        contactId: contactInboxModel.contactId,
      })
      .from(contactInboxModel)
      .where(
        sql`${contactInboxModel.inboxId} = ${inbox.id} AND ${contactInboxModel.sourceId} IN ${sourceIds}`,
      )

    const resolved = new Map<string, ResolvedEntry>()
    const existingContactIds = new Set<string>()

    for (const row of existingRows) {
      existingContactIds.add(row.contactId)
      // Conversation id filled lazily below (one query for all).
      resolved.set(row.sourceId, {
        sourceId: row.sourceId,
        contactInboxId: row.id,
        contactId: row.contactId,
        conversationId: "",
      })
    }

    // Resolve conversation ids for existing contacts in one query.
    if (existingContactIds.size > 0) {
      const conversations = await tx
        .select({
          id: conversationModel.id,
          contactId: conversationModel.contactId,
        })
        .from(conversationModel)
        .where(inArray(conversationModel.contactId, [...existingContactIds]))
      const convByContact = new Map(
        conversations.map((c) => [c.contactId, c.id]),
      )
      for (const entry of resolved.values()) {
        const cid = convByContact.get(entry.contactId)
        if (cid) {
          entry.conversationId = cid
        }
      }
    }

    // Enrich existing Contact rows: when the historical batch carries a
    // phoneNumber or email and the DB column is currently NULL, fill it in.
    // Single round-trip UPDATE for the whole batch; COALESCE preserves any
    // value already populated, so concurrent webhooks never get overwritten.
    if (resolved.size > 0) {
      const enrichmentRows: Array<{
        contactId: string
        phoneNumber: string | null
        email: string | null
      }> = []
      for (const [sourceId, entry] of dedup) {
        const link = resolved.get(sourceId)
        if (!link) {
          continue
        }
        const phoneNumber = entry.contact.phoneNumber || null
        const email = entry.contact.email || null
        if (phoneNumber || email) {
          enrichmentRows.push({
            contactId: link.contactId,
            phoneNumber,
            email,
          })
        }
      }
      if (enrichmentRows.length > 0) {
        const values = sql.join(
          enrichmentRows.map(
            (r) =>
              sql`(${r.contactId}::bigint, ${r.phoneNumber}::text, ${r.email}::text)`,
          ),
          sql`, `,
        )
        await tx.execute(sql`
          UPDATE "Contact" AS c SET
            "phoneNumber" = COALESCE(c."phoneNumber", v."phoneNumber"),
            "email"       = COALESCE(c."email",       v."email")
          FROM (VALUES ${values}) AS v("id", "phoneNumber", "email")
          WHERE c."id" = v."id"
            AND (
              (v."phoneNumber" IS NOT NULL AND c."phoneNumber" IS NULL)
              OR (v."email" IS NOT NULL AND c."email" IS NULL)
            )
        `)
      }
    }

    const newEntries = [...dedup.entries()].filter(
      ([sourceId]) => !resolved.has(sourceId),
    )

    // 2. Cap check under row lock.
    let acceptedNew: typeof newEntries = newEntries
    if (newEntries.length > 0) {
      const usageRows = await tx.execute<{
        contactsCount: number
        maxContacts: number
      }>(
        sql`SELECT "contactsCount", "maxContacts" FROM "WorkspaceUsage" WHERE "workspaceId" = ${workspaceId} FOR UPDATE`,
      )
      const usage = usageRows.rows[0]
      if (usage) {
        const slots = Math.max(0, usage.maxContacts - usage.contactsCount)
        acceptedNew = newEntries.slice(0, slots)
        const rejected = newEntries.slice(slots)
        skippedContacts = rejected.length
        failedMessages = rejected.reduce(
          (sum, [, e]) => sum + e.messages.length,
          0,
        )
        if (rejected.length > 0) {
          failureReason = `workspace contact cap reached (${usage.contactsCount}/${usage.maxContacts}) — ${rejected.length} contact(s) and ${failedMessages} message(s) rejected`
        }
      } else {
        logger.warn(
          { workspaceId },
          "[coexist] WorkspaceUsage row missing — rejecting all new contacts",
        )
        skippedContacts = newEntries.length
        failedMessages = newEntries.reduce(
          (sum, [, e]) => sum + e.messages.length,
          0,
        )
        acceptedNew = []
        failureReason = `WorkspaceUsage row missing for workspace ${workspaceId} — all ${newEntries.length} new contact(s) rejected`
      }
    }

    // 3. Insert Contact + ContactInbox + Conversation for acceptedNew.
    if (acceptedNew.length > 0) {
      const contactRows = acceptedNew.map(([, entry]) => ({
        id: createId(),
        workspaceId,
        firstName: entry.contact.firstName,
        lastName: entry.contact.lastName,
        email: entry.contact.email,
        phoneNumber: entry.contact.phoneNumber,
        avatar: entry.contact.avatar,
        lastActivityAt: new Date(),
      }))

      const _insertedContacts = await tx
        .insert(contactModel)
        .values(contactRows)
        .returning({ id: contactModel.id })

      // contactRows[i].id === insertedContacts[i].id (deterministic)
      const contactInboxRows = acceptedNew.map(([sourceId], i) => ({
        id: createId(),
        inboxId: inbox.id,
        contactId: contactRows[i]?.id,
        originalContactId: contactRows[i]?.id,
        source: inbox.channel,
        sourceId,
        channel: inbox.channel,
      }))

      const conversationRows = acceptedNew.map((_entry, i) => ({
        id: createId(),
        workspaceId,
        contactId: contactRows[i]?.id,
      }))

      // ContactInbox: backstop ON CONFLICT for concurrent webhook race.
      const insertedInboxes = await tx
        .insert(contactInboxModel)
        .values(contactInboxRows)
        .onConflictDoNothing({
          target: [contactInboxModel.inboxId, contactInboxModel.sourceId],
        })
        .returning({
          id: contactInboxModel.id,
          sourceId: contactInboxModel.sourceId,
          contactId: contactInboxModel.contactId,
        })

      const insertedSourceIds = new Set(insertedInboxes.map((r) => r.sourceId))

      // Race detection: any acceptedNew sourceId not in insertedInboxes hit a
      // concurrent insert. Re-SELECT to pick up the winning row + clean up the
      // pre-allocated orphan Contact that now has no ContactInbox.
      const racedSourceIds = acceptedNew
        .map(([sourceId]) => sourceId)
        .filter((s) => !insertedSourceIds.has(s))

      if (racedSourceIds.length > 0) {
        const winners = await tx
          .select({
            id: contactInboxModel.id,
            sourceId: contactInboxModel.sourceId,
            contactId: contactInboxModel.contactId,
          })
          .from(contactInboxModel)
          .where(
            sql`${contactInboxModel.inboxId} = ${inbox.id} AND ${contactInboxModel.sourceId} IN ${racedSourceIds}`,
          )
        for (const w of winners) {
          insertedInboxes.push(w)
          insertedSourceIds.add(w.sourceId)
        }

        // Delete orphan Contact rows pre-allocated for raced sourceIds.
        const orphanIds: string[] = []
        for (let i = 0; i < acceptedNew.length; i++) {
          const sourceId = acceptedNew[i]?.[0]
          const contactId = contactRows[i]?.id
          if (sourceId && contactId && racedSourceIds.includes(sourceId)) {
            orphanIds.push(contactId)
          }
        }
        if (orphanIds.length > 0) {
          await tx
            .delete(contactModel)
            .where(inArray(contactModel.id, orphanIds))
        }
      }

      // Count true new contacts (excludes the raced sourceIds).
      const trulyNew = acceptedNew.length - racedSourceIds.length
      importedContacts = trulyNew

      // Conversation: only for trulyNew. Filter rows for sourceIds that won
      // their own insert; for raced sourceIds we'd race the conversation too.
      const conversationsToInsert = conversationRows.filter(
        (_row, i) => !racedSourceIds.includes(acceptedNew[i]?.[0]),
      )
      if (conversationsToInsert.length > 0) {
        await tx
          .insert(conversationModel)
          .values(conversationsToInsert)
          .onConflictDoNothing({ target: [conversationModel.contactId] })
      }

      // 4. UPDATE WorkspaceUsage counter.
      if (trulyNew > 0) {
        await tx
          .update(workspaceUsageModel)
          .set({
            contactsCount: sql`${workspaceUsageModel.contactsCount} + ${trulyNew}`,
          })
          .where(sql`${workspaceUsageModel.workspaceId} = ${workspaceId}`)
      }

      // Resolve conversation ids for everything we just inserted (or raced
      // existing). One round-trip across all acceptedNew contact ids.
      const acceptedContactIds = insertedInboxes.map((r) => r.contactId)
      const newConversations = await tx
        .select({
          id: conversationModel.id,
          contactId: conversationModel.contactId,
        })
        .from(conversationModel)
        .where(inArray(conversationModel.contactId, acceptedContactIds))
      const convByContactNew = new Map(
        newConversations.map((c) => [c.contactId, c.id]),
      )

      for (const inboxRow of insertedInboxes) {
        const convId = convByContactNew.get(inboxRow.contactId)
        if (!convId) {
          continue
        }
        resolved.set(inboxRow.sourceId, {
          sourceId: inboxRow.sourceId,
          contactInboxId: inboxRow.id,
          contactId: inboxRow.contactId,
          conversationId: convId,
        })

        // Defer event emission to post-commit (don't block transaction).
        const entry = dedup.get(inboxRow.sourceId)
        if (entry) {
          newContactCreatedEvents.push({
            workspaceId,
            contactId: inboxRow.contactId,
            contactInboxId: inboxRow.id,
            sourceId: inboxRow.sourceId,
            firstName: entry.contact.firstName,
            phoneNumber: entry.contact.phoneNumber,
            email: entry.contact.email,
            channel: inbox.channel,
            source: inbox.channel,
            createdAt: new Date(),
          })
        }
      }
    }

    // Build contactInboxIds output map (existing + new accepted).
    for (const [sourceId, entry] of resolved) {
      contactInboxIds.set(sourceId, entry.contactInboxId)
    }

    // 5. Bulk INSERT Messages.
    const messageRows: (typeof messageModel.$inferInsert)[] = []
    let inputMessageCount = 0
    for (const [sourceId, entry] of dedup) {
      const link = resolved.get(sourceId)
      if (!link?.conversationId) {
        // Contact rejected (cap or unresolved race) — count messages as failed.
        // Note: cap-failed messages were already counted above.
        continue
      }
      for (const msg of entry.messages) {
        inputMessageCount += 1
        const isOutgoing = msg.messageType === "outgoing"
        const createdAt = msg.createdAt ?? new Date()
        messageRows.push({
          id: makeMessageId(createdAt),
          conversationId: link.conversationId,
          contactInboxId: link.contactInboxId,
          senderType: isOutgoing ? "user" : "contact",
          workspaceId,
          sourceId: msg.sourceId,
          senderId: isOutgoing ? null : link.contactId,
          messageType: msg.messageType,
          text: msg.text,
          contentType: msg.contentType,
          contentAttributes: msg.contentAttributes,
          createdAt,
          updatedAt: createdAt,
        })
      }
    }

    if (messageRows.length > 0) {
      // Chunk inserts: Drizzle SQL builder + Postgres 65535-param limit blow
      // up on huge .values() arrays. Message row has ~13 cols → 1000 rows ≈
      // 13k params, safely under the cap, and keeps the SQL AST shallow.
      const CHUNK_SIZE = 1000
      let insertedTotal = 0
      for (let i = 0; i < messageRows.length; i += CHUNK_SIZE) {
        const chunk = messageRows.slice(i, i + CHUNK_SIZE)
        let inserted: { id: string }[]
        try {
          inserted = await tx
            .insert(messageModel)
            .values(chunk)
            .onConflictDoNothing({
              target: [messageModel.contactInboxId, messageModel.sourceId],
            })
            .returning({ id: messageModel.id })
        } catch (err) {
          if (!isUniqueMessagePkViolation(err)) {
            throw err
          }
          // Cross-run PK collision (partition+ms+seq clash). Regenerate IDs
          // from the factory — sequence advances naturally — and retry once.
          logger.warn(
            { runId, chunkStart: i, chunkSize: chunk.length },
            "[coexist] Message PK collision — regenerating IDs and retrying",
          )
          const retried = chunk.map((row) => ({
            ...row,
            id: makeMessageId(new Date(row.createdAt as Date)),
          }))
          inserted = await tx
            .insert(messageModel)
            .values(retried)
            .onConflictDoNothing({
              target: [messageModel.contactInboxId, messageModel.sourceId],
            })
            .returning({ id: messageModel.id })
        }
        insertedTotal += inserted.length
      }
      importedMessages = insertedTotal
      skippedMessages = inputMessageCount - insertedTotal
    }
  })

  // 6. Post-commit side effects — fire-and-forget; failures must not roll back.
  for (const ev of newContactCreatedEvents) {
    emitContactCreated(
      ev.workspaceId,
      ev.contactId,
      ev.firstName,
      ev.phoneNumber,
      ev.email,
    ).catch((error) => {
      logger.error(error, "[coexist] Failed to emit contactCreated event")
    })

    emit("analytics:dashboard", {
      eventType: "contact:created",
      workspaceId: ev.workspaceId,
      contactId: ev.contactInboxId,
      occurredAt: ev.createdAt,
      source: ev.source,
      sourceId: ev.sourceId,
      channel: ev.channel,
      metadata: {
        triggerContext: {
          triggerSource: "worker",
          triggerHandler: "bulkImportHistorical",
          triggerType: "contact_created",
        },
      },
    }).catch((error) => {
      logger.error(error, "[coexist] Failed to emit contact:created")
    })
  }

  return {
    importedContacts,
    importedMessages,
    skippedContacts,
    skippedMessages,
    failedMessages,
    contactInboxIds,
    failureReason,
  }
}
