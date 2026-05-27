import { beforeEach, describe, expect, it, vi } from "vitest"

// ---------------------------------------------------------------------------
// Hoist mock function references so they are available inside vi.mock factories
// ---------------------------------------------------------------------------

const {
  mockFindFirst,
  mockFindOrFail,
  mockSelect,
  mockUpdate,
  mockAndFn,
  mockEqFn,
  mockIsNullFn,
  mockInArrayFn,
  mockBulkImport,
  mockQueueAdd,
} = vi.hoisted(() => ({
  mockFindFirst: vi.fn(),
  mockFindOrFail: vi.fn(),
  mockSelect: vi.fn(),
  mockUpdate: vi.fn(),
  mockAndFn: vi.fn((...args: unknown[]) => ({ __and: args })),
  mockEqFn: vi.fn((col: unknown, val: unknown) => ({ __eq: [col, val] })),
  mockIsNullFn: vi.fn((col: unknown) => ({ __isNull: col })),
  mockInArrayFn: vi.fn((col: unknown, vals: unknown) => ({
    __inArray: [col, vals],
  })),
  mockBulkImport: vi.fn(),
  mockQueueAdd: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    update: mockUpdate,
    select: mockSelect,
    query: {
      integrationWhatsappModel: { findFirst: mockFindFirst },
      integrationMessengerModel: { findFirst: vi.fn() },
    },
  },
  and: mockAndFn,
  eq: mockEqFn,
  isNull: mockIsNullFn,
  inArray: mockInArrayFn,
  lt: vi.fn(),
  ne: vi.fn(),
  or: vi.fn(),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      strings,
      values,
    }),
    { raw: (s: string) => s },
  ),
  findOrFail: mockFindOrFail,
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  IntegrationJobAction: {
    coexistWhatsappBuffer: "coexistWhatsappBuffer",
    coexistWhatsappFlush: "coexistWhatsappFlush",
    coexistMessengerSync: "coexistMessengerSync",
  },
  integrationQueue: { add: mockQueueAdd },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  whatsappCoexistStagingModel: {
    id: "id",
    phoneNumberId: "phoneNumberId",
    processedAt: "processedAt",
  },
  integrationWhatsappModel: {},
  inboxModel: {},
  coexistSyncRunModel: {
    id: "id",
    currentPageNumber: "currentPageNumber",
    attempts: "attempts",
    importedContactCount: "importedContactCount",
    importedMessageCount: "importedMessageCount",
    skippedCount: "skippedCount",
    failedCount: "failedCount",
    currentScan: "currentScan",
  },
}))

vi.mock("../src/integration/handlers/coexist/bulk-historical-import", () => ({
  bulkImportHistorical: mockBulkImport,
}))

// ---------------------------------------------------------------------------
// Import handler after mocks
// ---------------------------------------------------------------------------

import { coexistWhatsappFlush } from "../src/integration/handlers/coexist/whatsapp-flush"

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const runId = "run-1"
const phoneNumberId = "phone-456"

const fakeIntegration = {
  id: "int-1",
  workspaceId: "ws-1",
  phoneNumberId,
  coexistEnabled: true,
  inboxId: "inbox-1",
}

const fakeInbox = {
  id: "inbox-1",
  workspaceId: "ws-1",
  channel: "whatsapp",
}

const makeStagedRow = (id: string, waId = "601234567890") => ({
  id,
  phoneNumberId,
  processedAt: null,
  payload: {
    contacts: [{ wa_id: waId, profile: { name: "Alice" } }],
    history: [
      {
        threads: [
          {
            id: waId,
            messages: [
              {
                id: `msg-${id}`,
                from: waId,
                timestamp: "1700000000",
                type: "text",
                text: { body: "Hello" },
              },
            ],
          },
        ],
      },
    ],
  },
})

const defaultRunRow = () => ({
  workspaceId: "ws-1",
  currentPageNumber: 0,
  attempts: 0,
  importedContactCount: 0,
  importedMessageCount: 0,
  skippedCount: 0,
  failedCount: 0,
  currentScan: 0,
})

const emptyBulkResult = (overrides: Partial<Record<string, unknown>> = {}) => ({
  importedContacts: 0,
  importedMessages: 0,
  skippedContacts: 0,
  skippedMessages: 0,
  failedMessages: 0,
  contactInboxIds: new Map<string, string>(),
  ...overrides,
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Wires the production select call graph:
 *   1. First .select({...}).from().where().limit(1) → returns runRow.
 *   2. Subsequent .select().from().where().limit(BATCH_SIZE) → staged rows.
 *
 * The staged-row select returns `stagedRows` on the first batch call and `[]`
 * on every subsequent call (to terminate the loop deterministically).
 */
const wireSelect = (
  runRow: ReturnType<typeof defaultRunRow> | null,
  stagedRows: unknown[],
) => {
  const runRowChain = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
  }
  runRowChain.from.mockReturnValue(runRowChain)
  runRowChain.where.mockReturnValue(runRowChain)
  runRowChain.limit.mockResolvedValue(runRow ? [runRow] : [])

  const stagedChain = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
  }
  stagedChain.from.mockReturnValue(stagedChain)
  stagedChain.where.mockReturnValue(stagedChain)
  stagedChain.limit.mockResolvedValueOnce(stagedRows).mockResolvedValue([])

  // First call goes to runRowChain (uses .select({field selection})).
  // Second+ calls go to stagedChain (uses .select() with no arg).
  mockSelect.mockReturnValueOnce(runRowChain).mockReturnValue(stagedChain)
}

/**
 * Reusable update chain — supports both the fire-and-forget pattern
 * (`await db.update().set().where()`) and the optimistic-claim pattern
 * (`await db.update().set().where().returning()`). `.where()` returns a real
 * Promise with `.returning()` attached. Default claim resolves to
 * `[{ id: runId }]`; pass `wireUpdateChain([])` to simulate "already
 * claimed".
 */
const wireUpdateChain = (
  claimResult: Array<{ id: string }> = [{ id: runId }],
) => {
  mockUpdate.mockImplementation(() => {
    const chain = {
      set: vi.fn(),
      where: vi.fn(),
    }
    chain.set.mockReturnValue(chain)
    chain.where.mockImplementation(() =>
      Object.assign(Promise.resolve(undefined), {
        returning: vi.fn().mockResolvedValue(claimResult),
      }),
    )
    return chain
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("coexistWhatsappFlush", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    wireUpdateChain()
    mockBulkImport.mockResolvedValue(emptyBulkResult())
    mockQueueAdd.mockResolvedValue(undefined)
  })

  it("is a no-op when integration is not found", async () => {
    mockFindFirst.mockResolvedValue(null)

    await coexistWhatsappFlush({ runId, phoneNumberId })

    expect(mockSelect).not.toHaveBeenCalled()
    expect(mockBulkImport).not.toHaveBeenCalled()
  })

  it("is a no-op when coexistEnabled === false (billing gate)", async () => {
    mockFindFirst.mockResolvedValue({
      ...fakeIntegration,
      coexistEnabled: false,
    })

    await coexistWhatsappFlush({ runId, phoneNumberId })

    expect(mockSelect).not.toHaveBeenCalled()
    expect(mockBulkImport).not.toHaveBeenCalled()
  })

  it("is a no-op when CoexistSyncRun row is gone", async () => {
    mockFindFirst.mockResolvedValue(fakeIntegration)
    mockFindOrFail.mockResolvedValue(fakeInbox)
    wireSelect(null, [])

    await coexistWhatsappFlush({ runId, phoneNumberId })

    expect(mockBulkImport).not.toHaveBeenCalled()
  })

  it("sets status='running' on entry and status closes after exhaustion", async () => {
    mockFindFirst.mockResolvedValue(fakeIntegration)
    mockFindOrFail.mockResolvedValue(fakeInbox)
    wireSelect(defaultRunRow(), [])

    await coexistWhatsappFlush({ runId, phoneNumberId })

    const setPayloads = mockUpdate.mock.results
      .flatMap((r) => {
        const value = r.value as { set?: ReturnType<typeof vi.fn> } | undefined
        return value?.set?.mock.calls ?? []
      })
      .map((args) => args[0] as Record<string, unknown>)

    expect(setPayloads.some((p) => p.status === "running")).toBe(true)
    expect(setPayloads.some((p) => p.status === "succeeded")).toBe(true)
  })

  it("calls bulkImportHistorical with the coalesced batch when staged rows exist", async () => {
    mockFindFirst.mockResolvedValue(fakeIntegration)
    mockFindOrFail.mockResolvedValue(fakeInbox)
    wireSelect(defaultRunRow(), [makeStagedRow("row-1")])
    mockBulkImport.mockResolvedValueOnce(
      emptyBulkResult({ importedMessages: 1 }),
    )

    await coexistWhatsappFlush({ runId, phoneNumberId })

    expect(mockBulkImport).toHaveBeenCalledOnce()
    const [bulkArgs] = mockBulkImport.mock.calls[0] as [
      {
        inbox: typeof fakeInbox
        workspaceId: string
        runId: string
        batch: Array<{
          contact: { sourceId: string }
          messages: Array<{ sourceId: string }>
        }>
      },
    ]
    expect(bulkArgs.inbox).toBe(fakeInbox)
    expect(bulkArgs.workspaceId).toBe("ws-1")
    expect(bulkArgs.runId).toBe(runId)
    expect(bulkArgs.batch[0]?.contact.sourceId).toBe("601234567890")
    expect(bulkArgs.batch[0]?.messages[0]?.sourceId).toBe("msg-row-1")
  })

  it("coalesces multiple staging rows that reference the same wa_id into ONE batch entry", async () => {
    mockFindFirst.mockResolvedValue(fakeIntegration)
    mockFindOrFail.mockResolvedValue(fakeInbox)
    wireSelect(defaultRunRow(), [
      makeStagedRow("row-a", "601234567890"),
      makeStagedRow("row-b", "601234567890"),
    ])

    await coexistWhatsappFlush({ runId, phoneNumberId })

    const [bulkArgs] = mockBulkImport.mock.calls[0] as [
      {
        batch: Array<{
          contact: { sourceId: string }
          messages: Array<{ sourceId: string }>
        }>
      },
    ]
    expect(bulkArgs.batch).toHaveLength(1)
    expect(bulkArgs.batch[0]?.messages).toHaveLength(2)
  })

  it("marks ALL staging rows processed atomically after a successful bulk", async () => {
    mockFindFirst.mockResolvedValue(fakeIntegration)
    mockFindOrFail.mockResolvedValue(fakeInbox)
    const rows = [makeStagedRow("row-a"), makeStagedRow("row-b")]
    wireSelect(defaultRunRow(), rows)

    await coexistWhatsappFlush({ runId, phoneNumberId })

    expect(mockInArrayFn).toHaveBeenCalledWith(expect.anything(), [
      "row-a",
      "row-b",
    ])
    const setPayloads = mockUpdate.mock.results
      .flatMap((r) => {
        const value = r.value as { set?: ReturnType<typeof vi.fn> } | undefined
        return value?.set?.mock.calls ?? []
      })
      .map((args) => args[0] as Record<string, unknown>)
    expect(setPayloads.some((p) => "processedAt" in p)).toBe(true)
  })

  it("does NOT mark staging rows processed when bulk import throws", async () => {
    mockFindFirst.mockResolvedValue(fakeIntegration)
    mockFindOrFail.mockResolvedValue(fakeInbox)
    wireSelect(defaultRunRow(), [makeStagedRow("row-x")])
    mockBulkImport.mockRejectedValueOnce(new Error("bulk failed"))

    await coexistWhatsappFlush({ runId, phoneNumberId })

    // No update set call carries processedAt — staging rows stay unprocessed.
    const setPayloads = mockUpdate.mock.results
      .flatMap((r) => {
        const value = r.value as { set?: ReturnType<typeof vi.fn> } | undefined
        return value?.set?.mock.calls ?? []
      })
      .map((args) => args[0] as Record<string, unknown>)
    expect(setPayloads.some((p) => "processedAt" in p)).toBe(false)
    // Final status must close as failed.
    expect(setPayloads.some((p) => p.status === "failed")).toBe(true)
  })

  it("respects isNull(processedAt) when selecting staging rows (no double-processing)", async () => {
    mockFindFirst.mockResolvedValue(fakeIntegration)
    mockFindOrFail.mockResolvedValue(fakeInbox)
    wireSelect(defaultRunRow(), [])

    await coexistWhatsappFlush({ runId, phoneNumberId })

    expect(mockIsNullFn).toHaveBeenCalled()
  })

  it("counter inflation regression: failed contact's N messages do NOT inflate failedCount", async () => {
    mockFindFirst.mockResolvedValue(fakeIntegration)
    mockFindOrFail.mockResolvedValue(fakeInbox)
    wireSelect(defaultRunRow(), [makeStagedRow("row-1")])
    // Bulk pipeline reports: 1 message imported, 0 failed.
    mockBulkImport.mockResolvedValueOnce(
      emptyBulkResult({ importedMessages: 1 }),
    )

    await coexistWhatsappFlush({ runId, phoneNumberId })

    const closePayload = mockUpdate.mock.results
      .flatMap((r) => {
        const value = r.value as { set?: ReturnType<typeof vi.fn> } | undefined
        return value?.set?.mock.calls ?? []
      })
      .map((args) => args[0] as Record<string, unknown>)
      .find((p) => p && p.currentStep === "done")

    expect(closePayload?.failedCount).toBe(0)
    expect(closePayload?.importedMessageCount).toBe(1)
  })
})
