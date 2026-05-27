import { beforeEach, describe, expect, it, vi } from "vitest"

// ---------------------------------------------------------------------------
// Hoist mock function references so they are available inside vi.mock factories
// ---------------------------------------------------------------------------

const {
  mockFindFirstMessenger,
  mockFindFirstWorkspace,
  mockFindFirstCoexistRun,
  mockFindOrFail,
  mockListConversations,
  mockListMessages,
  mockBulkImport,
  mockSelect,
  mockUpdate,
  mockQueueAdd,
} = vi.hoisted(() => ({
  mockFindFirstMessenger: vi.fn(),
  mockFindFirstWorkspace: vi.fn(),
  mockFindFirstCoexistRun: vi.fn(),
  mockFindOrFail: vi.fn(),
  mockListConversations: vi.fn(),
  mockListMessages: vi.fn(),
  mockBulkImport: vi.fn(),
  mockSelect: vi.fn(),
  mockUpdate: vi.fn(),
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
      integrationMessengerModel: { findFirst: mockFindFirstMessenger },
      integrationWhatsappModel: { findFirst: vi.fn() },
      workspaceModel: { findFirst: mockFindFirstWorkspace },
      coexistSyncRunModel: { findFirst: mockFindFirstCoexistRun },
    },
  },
  and: vi.fn(),
  eq: vi.fn(),
  isNull: vi.fn(),
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
  whatsappCoexistStagingModel: {},
  integrationWhatsappModel: {},
  integrationMessengerModel: {},
  inboxModel: {},
  coexistSyncRunModel: {
    id: "id",
    lastSyncedAt: "lastSyncedAt",
    attempts: "attempts",
    importedContactCount: "importedContactCount",
    importedMessageCount: "importedMessageCount",
    skippedCount: "skippedCount",
    failedCount: "failedCount",
    currentScan: "currentScan",
    currentError: "currentError",
  },
}))

vi.mock("@chatbotx.io/integration-messenger/apis/sync", () => ({
  listConversations: mockListConversations,
  listMessages: mockListMessages,
}))

vi.mock("@chatbotx.io/integration-messenger/apis/usage", () => ({
  concurrencyForUsage: vi.fn(() => 5),
}))

vi.mock("../src/integration/handlers/coexist/bulk-historical-import", () => ({
  bulkImportHistorical: mockBulkImport,
}))

// ---------------------------------------------------------------------------
// Import handler after mocks
// ---------------------------------------------------------------------------

import { coexistMessengerSync } from "../src/integration/handlers/coexist/messenger-sync"

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PAGE_ID = "page-111"
const runId = "run-1"
const integrationId = "int-messenger-1"
const workspaceId = "ws-messenger-1"

const fakeIntegration = {
  id: integrationId,
  workspaceId,
  pageId: PAGE_ID,
  coexistEnabled: true,
  inboxId: "inbox-messenger-1",
  auth: {
    tokens: { accessToken: "access-token-abc" },
    metadata: { version: "v20.0" },
  },
}

const fakeInbox = {
  id: "inbox-messenger-1",
  workspaceId,
  channel: "messenger",
}

const customerParticipant = (id = "user-999") => ({
  id,
  name: "Bob Customer",
  email: "bob@example.com",
})

const makeConversation = (id: string, userId = "user-999") => ({
  id,
  participants: {
    data: [{ id: PAGE_ID, name: "My Page" }, customerParticipant(userId)],
  },
})

const RECENT_TS = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

const makeMessage = (
  id: string,
  fromId = "user-999",
  createdTime = RECENT_TS,
) => ({
  id,
  message: "Hey there!",
  from: { id: fromId, name: "Bob Customer" },
  created_time: createdTime,
})

const defaultRunRow = () => ({
  lastSyncedAt: null as Date | null,
  attempts: 0,
  importedContactCount: 0,
  importedMessageCount: 0,
  skippedCount: 0,
  failedCount: 0,
  currentScan: 0,
  currentError: null as string | null,
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

/** Chainable select stub. Returns the given runRow on `.limit(1)`. */
const wireSelectChain = (runRow: ReturnType<typeof defaultRunRow> | null) => {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
  }
  chain.from.mockReturnValue(chain)
  chain.where.mockReturnValue(chain)
  chain.limit.mockResolvedValue(runRow ? [runRow] : [])
  mockSelect.mockReturnValue(chain)
  return chain
}

/**
 * Reusable update chain — every db.update() returns a fresh chain. Supports
 * both the "fire-and-forget" pattern (`await db.update().set().where()`) AND
 * the optimistic-claim pattern (`await db.update().set().where().returning()`).
 * `.where()` returns a real Promise (resolves to undefined for the
 * fire-and-forget path) with `.returning()` attached for the claim path —
 * using a real Promise avoids the `noThenProperty` lint while staying
 * awaitable. The default claim result is `[{ id: runId }]` so the handler
 * treats the run as successfully claimed; tests that need "already claimed"
 * pass `wireUpdateChain([])`.
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

describe("coexistMessengerSync", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    wireSelectChain(defaultRunRow())
    wireUpdateChain()
    mockBulkImport.mockResolvedValue(emptyBulkResult())
    mockQueueAdd.mockResolvedValue(undefined)
    mockFindFirstWorkspace.mockResolvedValue({ targetCountry: "VN" })
    // Default: first run for this integration (no prior CoexistSyncRun).
    mockFindFirstCoexistRun.mockResolvedValue(null)
  })

  it("is a no-op when integration is not found", async () => {
    mockFindFirstMessenger.mockResolvedValue(null)

    await coexistMessengerSync({ runId, integrationId, workspaceId })

    expect(mockListConversations).not.toHaveBeenCalled()
    expect(mockBulkImport).not.toHaveBeenCalled()
  })

  it("is a no-op when workspaceId mismatches the row", async () => {
    mockFindFirstMessenger.mockResolvedValue({
      ...fakeIntegration,
      workspaceId: "other-ws",
    })

    await coexistMessengerSync({ runId, integrationId, workspaceId })

    expect(mockListConversations).not.toHaveBeenCalled()
    expect(mockBulkImport).not.toHaveBeenCalled()
  })

  it("is a no-op when coexistEnabled === false", async () => {
    mockFindFirstMessenger.mockResolvedValue({
      ...fakeIntegration,
      coexistEnabled: false,
    })

    await coexistMessengerSync({ runId, integrationId, workspaceId })

    expect(mockListConversations).not.toHaveBeenCalled()
    expect(mockBulkImport).not.toHaveBeenCalled()
  })

  it("is a no-op when access token is missing", async () => {
    mockFindFirstMessenger.mockResolvedValue({
      ...fakeIntegration,
      auth: { tokens: {}, metadata: {} },
    })

    await coexistMessengerSync({ runId, integrationId, workspaceId })

    expect(mockListConversations).not.toHaveBeenCalled()
  })

  it("is a no-op when CoexistSyncRun row is gone", async () => {
    mockFindFirstMessenger.mockResolvedValue(fakeIntegration)
    mockFindOrFail.mockResolvedValue(fakeInbox)
    wireSelectChain(null)

    await coexistMessengerSync({ runId, integrationId, workspaceId })

    expect(mockListConversations).not.toHaveBeenCalled()
    expect(mockBulkImport).not.toHaveBeenCalled()
  })

  it("fetches one page of conversations and invokes bulkImportHistorical with the assembled batch", async () => {
    mockFindFirstMessenger.mockResolvedValue(fakeIntegration)
    mockFindOrFail.mockResolvedValue(fakeInbox)

    mockListConversations.mockResolvedValueOnce({
      data: [makeConversation("conv-abc", "user-999")],
      after: undefined,
    })
    mockListMessages.mockResolvedValueOnce({
      data: [makeMessage("msg-xyz", "user-999")],
      after: undefined,
    })
    mockBulkImport.mockResolvedValueOnce(
      emptyBulkResult({ importedMessages: 1 }),
    )

    await coexistMessengerSync({ runId, integrationId, workspaceId })

    expect(mockListConversations).toHaveBeenCalledOnce()
    expect(mockListMessages).toHaveBeenCalledOnce()
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
    expect(bulkArgs.workspaceId).toBe(workspaceId)
    expect(bulkArgs.runId).toBe(runId)
    expect(bulkArgs.batch).toHaveLength(1)
    expect(bulkArgs.batch[0]?.contact.sourceId).toBe("user-999")
    expect(bulkArgs.batch[0]?.messages[0]?.sourceId).toBe("msg-xyz")
  })

  it("paginates messages within a conversation under one bulk import call", async () => {
    mockFindFirstMessenger.mockResolvedValue(fakeIntegration)
    mockFindOrFail.mockResolvedValue(fakeInbox)

    mockListConversations.mockResolvedValueOnce({
      data: [makeConversation("conv-1", "user-1")],
      after: undefined,
    })

    mockListMessages
      .mockResolvedValueOnce({
        data: [makeMessage("msg-a", "user-1")],
        after: "msg-cursor-2",
      })
      .mockResolvedValueOnce({
        data: [makeMessage("msg-b", "user-1")],
        after: undefined,
      })

    await coexistMessengerSync({ runId, integrationId, workspaceId })

    expect(mockListMessages).toHaveBeenCalledTimes(2)
    expect(mockListMessages).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ after: "msg-cursor-2" }),
    )
    expect(mockBulkImport).toHaveBeenCalledOnce()
    const [bulkArgs] = mockBulkImport.mock.calls[0] as [
      { batch: Array<{ messages: unknown[] }> },
    ]
    expect(bulkArgs.batch[0]?.messages).toHaveLength(2)
  })

  it("skips conversations that contain only the Page PSID", async () => {
    mockFindFirstMessenger.mockResolvedValue(fakeIntegration)
    mockFindOrFail.mockResolvedValue(fakeInbox)

    mockListConversations.mockResolvedValueOnce({
      data: [
        {
          id: "conv-page-only",
          participants: { data: [{ id: PAGE_ID, name: "My Page" }] },
        },
      ],
      after: undefined,
    })

    await coexistMessengerSync({ runId, integrationId, workspaceId })

    expect(mockListMessages).not.toHaveBeenCalled()
    // Bulk import is still called with an empty batch (page-level commit point).
    expect(mockBulkImport).toHaveBeenCalledOnce()
    const [bulkArgs] = mockBulkImport.mock.calls[0] as [{ batch: unknown[] }]
    expect(bulkArgs.batch).toHaveLength(0)
  })

  it("never uses the Page PSID as a contact sourceId", async () => {
    mockFindFirstMessenger.mockResolvedValue(fakeIntegration)
    mockFindOrFail.mockResolvedValue(fakeInbox)

    const customerId = "user-customer-789"
    mockListConversations.mockResolvedValueOnce({
      data: [makeConversation("conv-2", customerId)],
      after: undefined,
    })
    mockListMessages.mockResolvedValueOnce({
      data: [makeMessage("msg-m", customerId)],
      after: undefined,
    })

    await coexistMessengerSync({ runId, integrationId, workspaceId })

    const [bulkArgs] = mockBulkImport.mock.calls[0] as [
      { batch: Array<{ contact: { sourceId: string } }> },
    ]
    for (const entry of bulkArgs.batch) {
      expect(entry.contact.sourceId).not.toBe(PAGE_ID)
    }
  })

  it("skips messages without a text body", async () => {
    mockFindFirstMessenger.mockResolvedValue(fakeIntegration)
    mockFindOrFail.mockResolvedValue(fakeInbox)

    mockListConversations.mockResolvedValueOnce({
      data: [makeConversation("conv-3", "user-3")],
      after: undefined,
    })
    mockListMessages.mockResolvedValueOnce({
      data: [
        {
          id: "msg-notext",
          from: { id: "user-3" },
          created_time: "2024-01-01T10:00:00Z",
        },
      ],
      after: undefined,
    })

    await coexistMessengerSync({ runId, integrationId, workspaceId })

    const [bulkArgs] = mockBulkImport.mock.calls[0] as [
      { batch: Array<{ messages: unknown[] }> },
    ]
    expect(bulkArgs.batch[0]?.messages ?? []).toHaveLength(0)
  })

  it("persists lastSyncedAt watermark (oldest CONVERSATION.updated_time processed) after the page", async () => {
    mockFindFirstMessenger.mockResolvedValue(fakeIntegration)
    mockFindOrFail.mockResolvedValue(fakeInbox)

    // Two convs with distinct updated_time. Watermark must track the oldest
    // CONV updated_time (not message.created_time) so resume on the next chunk
    // correctly compares against conv.updated_time which Graph DESC-sorts on.
    const newerConvTs = new Date(
      Date.now() - 1 * 24 * 60 * 60 * 1000,
    ).toISOString()
    const olderConvTs = new Date(
      Date.now() - 5 * 24 * 60 * 60 * 1000,
    ).toISOString()

    mockListConversations.mockResolvedValueOnce({
      data: [
        {
          ...makeConversation("conv-newer", "user-1"),
          updated_time: newerConvTs,
        },
        {
          ...makeConversation("conv-older", "user-2"),
          updated_time: olderConvTs,
        },
      ],
      after: undefined,
    })
    mockListMessages.mockResolvedValue({
      data: [makeMessage("msg-x", "user-1", RECENT_TS)],
      after: undefined,
    })

    await coexistMessengerSync({ runId, integrationId, workspaceId })

    const allSetCalls = mockUpdate.mock.results
      .flatMap((r) => {
        const value = r.value as { set?: ReturnType<typeof vi.fn> } | undefined
        return value?.set?.mock.calls ?? []
      })
      .map((args) => args[0] as Record<string, unknown>)

    const watermarkCall = allSetCalls.find(
      (payload) =>
        payload &&
        "lastSyncedAt" in payload &&
        payload.lastSyncedAt instanceof Date,
    )
    expect(watermarkCall).toBeDefined()
    expect((watermarkCall?.lastSyncedAt as Date).toISOString()).toBe(
      olderConvTs,
    )
  })

  it("aborts when optimistic claim returns empty (run already owned by another worker)", async () => {
    mockFindFirstMessenger.mockResolvedValue(fakeIntegration)
    mockFindOrFail.mockResolvedValue(fakeInbox)
    // Override the default wire-up so the claim UPDATE returns [] — handler
    // must log + return without calling listConversations.
    wireUpdateChain([])

    mockListConversations.mockResolvedValueOnce({
      data: [makeConversation("conv-never-fetched", "user-1")],
      after: undefined,
    })

    await coexistMessengerSync({ runId, integrationId, workspaceId })

    expect(mockListConversations).not.toHaveBeenCalled()
    expect(mockBulkImport).not.toHaveBeenCalled()
  })

  it("skips conversations whose updated_time is newer than the within-run frontier", async () => {
    mockFindFirstMessenger.mockResolvedValue(fakeIntegration)
    mockFindOrFail.mockResolvedValue(fakeInbox)

    // Frontier: anything strictly newer than this was processed in a prior
    // chunk of THIS run and must be skipped.
    const frontier = new Date(Date.now() - 24 * 60 * 60 * 1000)
    wireSelectChain({ ...defaultRunRow(), lastSyncedAt: frontier })

    const newerConvTs = new Date(frontier.getTime() + 60 * 1000).toISOString()
    const olderConvTs = new Date(frontier.getTime() - 60 * 1000).toISOString()

    mockListConversations.mockResolvedValueOnce({
      data: [
        {
          ...makeConversation("conv-newer", "user-1"),
          updated_time: newerConvTs,
        },
        {
          ...makeConversation("conv-older", "user-2"),
          updated_time: olderConvTs,
        },
      ],
      after: undefined,
    })
    mockListMessages.mockResolvedValue({
      data: [makeMessage("msg-1", "user-2", olderConvTs)],
      after: undefined,
    })

    await coexistMessengerSync({ runId, integrationId, workspaceId })

    // Only the older conv passed the frontier filter.
    expect(mockListMessages).toHaveBeenCalledOnce()
  })

  it("stops the walk when prior run succeeded — ceiling = priorRun.startedAt", async () => {
    mockFindFirstMessenger.mockResolvedValue(fakeIntegration)
    mockFindOrFail.mockResolvedValue(fakeInbox)

    const priorStartedAt = new Date(Date.now() - 12 * 60 * 60 * 1000)
    mockFindFirstCoexistRun.mockResolvedValue({
      startedAt: priorStartedAt,
      lastSyncedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      status: "succeeded",
    })

    const belowCeilingTs = new Date(
      priorStartedAt.getTime() - 60 * 1000,
    ).toISOString()
    mockListConversations.mockResolvedValueOnce({
      data: [
        {
          ...makeConversation("conv-below-ceiling", "user-1"),
          updated_time: belowCeilingTs,
        },
      ],
      after: "should-not-be-followed",
    })

    await coexistMessengerSync({ runId, integrationId, workspaceId })

    // Conv at-or-below ceiling → walk stops, no messages fetched, no
    // follow-up page request.
    expect(mockListMessages).not.toHaveBeenCalled()
    expect(mockListConversations).toHaveBeenCalledOnce()
  })

  it("after prior partial — ceiling = priorRun.lastSyncedAt (boundary the prior attempt reached)", async () => {
    mockFindFirstMessenger.mockResolvedValue(fakeIntegration)
    mockFindOrFail.mockResolvedValue(fakeInbox)

    const priorLastSyncedAt = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    mockFindFirstCoexistRun.mockResolvedValue({
      startedAt: new Date(Date.now() - 12 * 60 * 60 * 1000),
      lastSyncedAt: priorLastSyncedAt,
      status: "partial",
    })

    const aboveCeilingTs = new Date(
      priorLastSyncedAt.getTime() + 60 * 1000,
    ).toISOString()
    const belowCeilingTs = new Date(
      priorLastSyncedAt.getTime() - 60 * 1000,
    ).toISOString()

    mockListConversations.mockResolvedValueOnce({
      data: [
        {
          ...makeConversation("conv-above", "user-1"),
          updated_time: aboveCeilingTs,
        },
        {
          ...makeConversation("conv-below", "user-2"),
          updated_time: belowCeilingTs,
        },
      ],
      after: undefined,
    })
    mockListMessages.mockResolvedValueOnce({
      data: [makeMessage("msg-a", "user-1", aboveCeilingTs)],
      after: undefined,
    })

    await coexistMessengerSync({ runId, integrationId, workspaceId })

    // Only the conv above the ceiling triggers a message fetch.
    expect(mockListMessages).toHaveBeenCalledOnce()
  })

  it("conversation fetch failure counts as one failed contact (no N-message inflation)", async () => {
    mockFindFirstMessenger.mockResolvedValue(fakeIntegration)
    mockFindOrFail.mockResolvedValue(fakeInbox)

    mockListConversations.mockResolvedValueOnce({
      data: [makeConversation("conv-broken", "user-broken")],
      after: undefined,
    })
    // Single page with messages that would have been ~100 — but the fetch
    // throws so the sentinel path runs and counts ONE failure for this conv.
    mockListMessages.mockRejectedValueOnce(new Error("Graph 500"))

    await coexistMessengerSync({ runId, integrationId, workspaceId })

    // Bulk import called with an empty batch (the failed conv was filtered).
    const [bulkArgs] = mockBulkImport.mock.calls[0] as [{ batch: unknown[] }]
    expect(bulkArgs.batch).toHaveLength(0)

    // failedCount in the final update set should be 1 — not 100.
    const closeCall = mockUpdate.mock.results
      .flatMap((r) => {
        const value = r.value as { set?: ReturnType<typeof vi.fn> } | undefined
        return value?.set?.mock.calls ?? []
      })
      .map((args) => args[0] as Record<string, unknown>)
      .find((payload) => payload && payload.currentStep === "done")
    expect(closeCall?.failedCount).toBe(1)
  })
})
