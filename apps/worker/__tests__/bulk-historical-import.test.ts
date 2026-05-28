import { beforeEach, describe, expect, it, vi } from "vitest"

// ---------------------------------------------------------------------------
// Hoist mocks — the bulk pipeline calls many DB primitives we must stub:
// transaction() runs the callback inline against a fake `tx` object that
// exposes select(), insert(), update(), delete(), and execute().
// ---------------------------------------------------------------------------

const {
  mockTransaction,
  mockTxSelect,
  mockTxInsert,
  mockTxUpdate,
  mockTxDelete,
  mockTxExecute,
  mockEmitContactCreated,
  mockEmit,
  mockCreateId,
} = vi.hoisted(() => ({
  mockTransaction: vi.fn(),
  mockTxSelect: vi.fn(),
  mockTxInsert: vi.fn(),
  mockTxUpdate: vi.fn(),
  mockTxDelete: vi.fn(),
  mockTxExecute: vi.fn(),
  mockEmitContactCreated: vi.fn(() => Promise.resolve()),
  mockEmit: vi.fn(() => Promise.resolve()),
  mockCreateId: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => {
  const tx = {
    select: mockTxSelect,
    insert: mockTxInsert,
    update: mockTxUpdate,
    delete: mockTxDelete,
    execute: mockTxExecute,
  }
  mockTransaction.mockImplementation((cb: (tx: unknown) => unknown) => cb(tx))
  return {
    db: { transaction: mockTransaction },
    inArray: vi.fn((col: unknown, vals: unknown) => ({
      __inArray: [col, vals],
    })),
    sql: Object.assign(
      (strings: TemplateStringsArray, ..._args: unknown[]) => ({
        __sql: strings.raw,
      }),
      {
        raw: (s: string) => s,
        join: (chunks: unknown[], _sep?: unknown) => ({ __join: chunks }),
      },
    ),
  }
})

vi.mock("@chatbotx.io/database/schema", () => ({
  contactInboxModel: {
    id: "ci_id",
    sourceId: "ci_sourceId",
    contactId: "ci_contactId",
    inboxId: "ci_inboxId",
  },
  contactModel: { id: "c_id" },
  conversationModel: { id: "conv_id", contactId: "conv_contactId" },
  messageModel: {
    id: "m_id",
    contactInboxId: "m_ci",
    sourceId: "m_sid",
    $inferInsert: {},
  },
  workspaceUsageModel: {
    workspaceId: "wu_workspaceId",
    contactsCount: "wu_count",
  },
}))

vi.mock("@chatbotx.io/event-bus", () => ({ emit: mockEmit }))
vi.mock("@chatbotx.io/events", () => ({
  emitContactCreated: mockEmitContactCreated,
}))
vi.mock("@chatbotx.io/utils", () => ({ createId: mockCreateId }))

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { bulkImportHistorical } from "../src/integration/handlers/coexist/bulk-historical-import"

// ---------------------------------------------------------------------------
// Helpers — chain builders mirroring Drizzle's fluent API
// ---------------------------------------------------------------------------

type SelectStubConfig = {
  /** Rows returned by .where() (terminal in production code for SELECTs without limit/orderBy). */
  rows?: unknown[]
}

/** Stub a single tx.select(...).from(...).where(...) chain returning `rows`. */
const enqueueSelect = (config: SelectStubConfig = {}) => {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
  }
  chain.from.mockReturnValue(chain)
  chain.where.mockResolvedValue(config.rows ?? [])
  mockTxSelect.mockReturnValueOnce(chain)
  return chain
}

type InsertStubConfig = {
  returningRows?: unknown[]
}

/**
 * Stub tx.insert(...).values(...) which may be terminal, or chain
 * .onConflictDoNothing().returning() / .returning().
 */
const enqueueInsert = (config: InsertStubConfig = {}) => {
  const chain = {
    values: vi.fn(),
    onConflictDoNothing: vi.fn(),
    returning: vi.fn(),
  }
  chain.values.mockReturnValue(chain)
  chain.onConflictDoNothing.mockReturnValue(chain)
  chain.returning.mockResolvedValue(config.returningRows ?? [])
  // Without .returning(), .onConflictDoNothing() should be awaitable too.
  // We also make .values() awaitable in case the call has no further chain.
  // Vitest mock functions returning `chain` are also a thenable? No.
  // The production code always uses .returning() after onConflictDoNothing,
  // and uses .returning() after .values() for the Contact insert, so this
  // is sufficient.
  mockTxInsert.mockReturnValueOnce(chain)
  return chain
}

/**
 * Stub tx.insert(...).values(...).onConflictDoNothing(...) where the chain is
 * AWAITED directly without .returning() (e.g. the Conversation insert).
 */
const enqueueInsertNoReturning = () => {
  const chain = {
    values: vi.fn(),
    onConflictDoNothing: vi.fn(),
    returning: vi.fn(),
  }
  chain.values.mockReturnValue(chain)
  chain.onConflictDoNothing.mockResolvedValue(undefined)
  chain.returning.mockResolvedValue([])
  mockTxInsert.mockReturnValueOnce(chain)
  return chain
}

/** Stub tx.update(...).set(...).where(...) — awaitable at .where(). */
const enqueueUpdate = () => {
  const chain = { set: vi.fn(), where: vi.fn() }
  chain.set.mockReturnValue(chain)
  chain.where.mockResolvedValue(undefined)
  mockTxUpdate.mockReturnValueOnce(chain)
  return chain
}

/** Stub tx.delete(...).where(...). */
const _enqueueDelete = () => {
  const chain = { where: vi.fn() }
  chain.where.mockResolvedValue(undefined)
  mockTxDelete.mockReturnValueOnce(chain)
  return chain
}

const inbox = {
  id: "inbox-1",
  workspaceId: "ws-1",
  channel: "messenger",
} as never

const workspaceId = "ws-1"

const contact = (
  sourceId: string,
  overrides: Record<string, unknown> = {},
) => ({
  sourceId,
  firstName: "Bob",
  email: "bob@example.com",
  ...overrides,
})

const msg = (sourceId: string, overrides: Record<string, unknown> = {}) => ({
  sourceId,
  messageType: "incoming" as const,
  contentType: "text" as const,
  text: "hi",
  ...overrides,
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("bulkImportHistorical", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    let idCounter = 0
    mockCreateId.mockImplementation(() => `id-${++idCounter}`)
    // Re-wire transaction default after clearAllMocks resets it.
    const tx = {
      select: mockTxSelect,
      insert: mockTxInsert,
      update: mockTxUpdate,
      delete: mockTxDelete,
      execute: mockTxExecute,
    }
    mockTransaction.mockImplementation((cb: (tx: unknown) => unknown) => cb(tx))
  })

  it("empty batch returns zero counts without opening a transaction", async () => {
    const result = await bulkImportHistorical({
      inbox,
      workspaceId,
      runId: "12345",
      batch: [],
    })

    expect(result).toEqual({
      importedContacts: 0,
      importedMessages: 0,
      skippedContacts: 0,
      skippedMessages: 0,
      failedMessages: 0,
      contactInboxIds: new Map(),
      insertedAttachmentIds: [],
      failureReason: undefined,
    })
    expect(mockTransaction).not.toHaveBeenCalled()
  })

  it("inserts new contact + messages when no existing ContactInbox matches", async () => {
    // 1. existing ContactInbox SELECT → none
    enqueueSelect({ rows: [] })
    // 2. WorkspaceUsage SELECT FOR UPDATE (via tx.execute)
    mockTxExecute.mockResolvedValueOnce({
      rows: [{ contactsCount: 5, maxContacts: 100 }],
    })
    // 3. INSERT Contact → returning (one row)
    enqueueInsert({ returningRows: [{ id: "id-1" }] })
    // 4. INSERT ContactInbox → onConflictDoNothing.returning
    enqueueInsert({
      returningRows: [{ id: "ci-1", sourceId: "src-1", contactId: "id-1" }],
    })
    // 5. INSERT Conversation → onConflictDoNothing (terminal, no .returning())
    enqueueInsertNoReturning()
    // 6. UPDATE WorkspaceUsage
    enqueueUpdate()
    // 7. SELECT conversations for new contact ids
    enqueueSelect({ rows: [{ id: "conv-1", contactId: "id-1" }] })
    // 8. INSERT Message → onConflictDoNothing.returning
    enqueueInsert({ returningRows: [{ id: "m-1" }] })

    const result = await bulkImportHistorical({
      inbox,
      workspaceId,
      runId: "12345",
      batch: [{ contact: contact("src-1"), messages: [msg("m-src-1")] }],
    })

    expect(result.importedContacts).toBe(1)
    expect(result.importedMessages).toBe(1)
    expect(result.skippedContacts).toBe(0)
    expect(result.failedMessages).toBe(0)
    expect(result.contactInboxIds.get("src-1")).toBe("ci-1")
  })

  it("counts duplicates as skippedMessages when message INSERT returns fewer rows than input", async () => {
    enqueueSelect({ rows: [] })
    mockTxExecute.mockResolvedValueOnce({
      rows: [{ contactsCount: 0, maxContacts: 100 }],
    })
    enqueueInsert({ returningRows: [{ id: "id-1" }] })
    enqueueInsert({
      returningRows: [{ id: "ci-1", sourceId: "src-1", contactId: "id-1" }],
    })
    enqueueInsertNoReturning()
    enqueueUpdate()
    enqueueSelect({ rows: [{ id: "conv-1", contactId: "id-1" }] })
    // 3 messages in, only 1 inserted → 2 duplicates
    enqueueInsert({ returningRows: [{ id: "m-1" }] })

    const result = await bulkImportHistorical({
      inbox,
      workspaceId,
      runId: "12345",
      batch: [
        {
          contact: contact("src-1"),
          messages: [msg("m-1"), msg("m-2"), msg("m-3")],
        },
      ],
    })

    expect(result.importedMessages).toBe(1)
    expect(result.skippedMessages).toBe(2)
  })

  it("rejects contacts past workspace cap (skippedContacts + failedMessages, no Contact INSERT)", async () => {
    enqueueSelect({ rows: [] })
    // cap = 2, used = 1 → only 1 slot
    mockTxExecute.mockResolvedValueOnce({
      rows: [{ contactsCount: 1, maxContacts: 2 }],
    })
    enqueueInsert({ returningRows: [{ id: "id-1" }] })
    enqueueInsert({
      returningRows: [{ id: "ci-1", sourceId: "src-1", contactId: "id-1" }],
    })
    enqueueInsertNoReturning()
    enqueueUpdate()
    enqueueSelect({ rows: [{ id: "conv-1", contactId: "id-1" }] })
    enqueueInsert({ returningRows: [{ id: "m-acc-1" }] })

    const result = await bulkImportHistorical({
      inbox,
      workspaceId,
      runId: "12345",
      batch: [
        { contact: contact("src-1"), messages: [msg("m-acc-1")] },
        {
          contact: contact("src-2"),
          messages: [msg("m-rej-1"), msg("m-rej-2"), msg("m-rej-3")],
        },
      ],
    })

    expect(result.importedContacts).toBe(1)
    expect(result.skippedContacts).toBe(1)
    expect(result.failedMessages).toBe(3)
    expect(result.importedMessages).toBe(1)
    expect(result.failureReason).toContain("workspace contact cap reached")
  })

  it("rejects ALL new contacts when WorkspaceUsage row is missing", async () => {
    enqueueSelect({ rows: [] })
    mockTxExecute.mockResolvedValueOnce({ rows: [] })

    const result = await bulkImportHistorical({
      inbox,
      workspaceId,
      runId: "12345",
      batch: [
        { contact: contact("src-1"), messages: [msg("m-1")] },
        { contact: contact("src-2"), messages: [msg("m-2"), msg("m-3")] },
      ],
    })

    expect(result.importedContacts).toBe(0)
    expect(result.skippedContacts).toBe(2)
    expect(result.failedMessages).toBe(3)
    expect(result.importedMessages).toBe(0)
    expect(result.failureReason).toContain("WorkspaceUsage row missing")
  })

  it("uses existing ContactInbox row for already-known sourceId (idempotent re-run)", async () => {
    // existing row present
    enqueueSelect({
      rows: [{ id: "ci-existing", sourceId: "src-1", contactId: "c-existing" }],
    })
    // conversations lookup for existing contact ids
    enqueueSelect({
      rows: [{ id: "conv-existing", contactId: "c-existing" }],
    })
    // No new contacts → skips cap check, contact insert, etc.
    // Goes straight to message INSERT.
    enqueueInsert({ returningRows: [] })

    const result = await bulkImportHistorical({
      inbox,
      workspaceId,
      runId: "12345",
      batch: [
        { contact: contact("src-1"), messages: [msg("m-1"), msg("m-2")] },
      ],
    })

    expect(result.importedContacts).toBe(0)
    expect(result.skippedContacts).toBe(0)
    expect(result.importedMessages).toBe(0)
    expect(result.skippedMessages).toBe(2)
    expect(result.contactInboxIds.get("src-1")).toBe("ci-existing")
  })

  it("dedups batch entries that share the same sourceId (merges messages)", async () => {
    enqueueSelect({ rows: [] })
    mockTxExecute.mockResolvedValueOnce({
      rows: [{ contactsCount: 0, maxContacts: 100 }],
    })
    enqueueInsert({ returningRows: [{ id: "id-1" }] })
    enqueueInsert({
      returningRows: [
        { id: "ci-1", sourceId: "src-shared", contactId: "id-1" },
      ],
    })
    enqueueInsertNoReturning()
    enqueueUpdate()
    enqueueSelect({ rows: [{ id: "conv-1", contactId: "id-1" }] })
    enqueueInsert({
      returningRows: [{ id: "m-1" }, { id: "m-2" }],
    })

    const result = await bulkImportHistorical({
      inbox,
      workspaceId,
      runId: "12345",
      batch: [
        { contact: contact("src-shared"), messages: [msg("m-a")] },
        { contact: contact("src-shared"), messages: [msg("m-b")] },
      ],
    })

    expect(result.importedContacts).toBe(1)
    expect(result.importedMessages).toBe(2)
    expect(result.contactInboxIds.size).toBe(1)
  })
})
