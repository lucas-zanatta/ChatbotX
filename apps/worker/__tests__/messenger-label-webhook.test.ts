import { beforeEach, describe, expect, test, vi } from "vitest"

// ── query spies ───────────────────────────────────────────────────────────────
const findMessengerIntegrationFirst = vi.fn()
const findTagFirst = vi.fn()
const findTagChannelFirst = vi.fn()
const findContactInboxFirst = vi.fn()

// ── mutation spies ────────────────────────────────────────────────────────────
const insertCalls: Array<{ model: unknown; values: unknown }> = []
const deleteCalls: Array<{ model: unknown; condition: unknown }> = []
const insertReturning = vi.fn()

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      integrationMessengerModel: {
        findFirst: (...args: unknown[]) =>
          findMessengerIntegrationFirst(...args),
      },
      tagModel: { findFirst: (...args: unknown[]) => findTagFirst(...args) },
      tagChannelModel: {
        findFirst: (...args: unknown[]) => findTagChannelFirst(...args),
      },
      contactInboxModel: {
        findFirst: (...args: unknown[]) => findContactInboxFirst(...args),
      },
    },
    insert: (model: unknown) => ({
      values: (vals: unknown) => {
        insertCalls.push({ model, values: vals })
        return {
          onConflictDoNothing: () => ({
            returning: () => insertReturning(),
          }),
        }
      },
    }),
    delete: (model: unknown) => ({
      where: (cond: unknown) => {
        deleteCalls.push({ model, condition: cond })
        return Promise.resolve()
      },
    }),
  },
  and: (...args: unknown[]) => ({ and: args }),
  eq: (a: unknown, b: unknown) => ({ eq: [a, b] }),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  tagModel: {
    __name: "Tag",
    workspaceId: "Tag.workspaceId",
    name: "Tag.name",
    id: "Tag.id",
  },
  tagChannelModel: {
    __name: "TagChannel",
    id: "TagChannel.id",
    tagId: "TagChannel.tagId",
    workspaceId: "TagChannel.workspaceId",
    channelType: "TagChannel.channelType",
    integrationId: "TagChannel.integrationId",
    externalLabelId: "TagChannel.externalLabelId",
  },
  contactsToTagsModel: { __name: "ContactsToTags" },
  contactToTagChannelModel: {
    __name: "ContactToTagChannel",
    tagChannelId: "ContactToTagChannel.tagChannelId",
    contactInboxId: "ContactToTagChannel.contactInboxId",
  },
}))

vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/utils")>()
  return { ...actual, createId: () => "generated-id" }
})

vi.mock("../src/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const { handleMessengerLabelWebhook } = await import(
  "../src/integration/handlers/messenger-label-webhook"
)

const PAGE_ID = "page-1"
const WS = "ws-1"
const INTEGRATION = {
  id: "int-1",
  pageId: PAGE_ID,
  inboxId: "inbox-1",
  workspaceId: WS,
  syncTagEnabledAt: new Date(),
}

const buildPayload = (value: Record<string, unknown>) => ({
  object: "page",
  entry: [
    {
      id: PAGE_ID,
      time: 1_700_000_000,
      changes: [{ field: "inbox_labels", value }],
    },
  ],
})

const run = (value: Record<string, unknown>) =>
  handleMessengerLabelWebhook({
    integrationIdentifier: PAGE_ID,
    integrationType: "messenger",
    payload: buildPayload(value),
  })

const modelName = (m: unknown) => (m as { __name: string }).__name

beforeEach(() => {
  findMessengerIntegrationFirst.mockReset()
  findTagFirst.mockReset()
  findTagChannelFirst.mockReset()
  findContactInboxFirst.mockReset()
  insertReturning.mockReset()
  insertCalls.length = 0
  deleteCalls.length = 0

  findMessengerIntegrationFirst.mockResolvedValue(INTEGRATION)
  insertReturning.mockResolvedValue([{ id: "generated-id" }])
})

describe("handleMessengerLabelWebhook — guards", () => {
  test("ignores invalid payload", async () => {
    await handleMessengerLabelWebhook({
      integrationIdentifier: PAGE_ID,
      integrationType: "messenger",
      payload: { not: "valid" },
    })
    expect(findMessengerIntegrationFirst).not.toHaveBeenCalled()
  })

  test("ignores when no inbox_labels change present", async () => {
    await handleMessengerLabelWebhook({
      integrationIdentifier: PAGE_ID,
      integrationType: "messenger",
      payload: {
        object: "page",
        entry: [{ id: PAGE_ID, time: 1, changes: [] }],
      },
    })
    expect(findMessengerIntegrationFirst).not.toHaveBeenCalled()
  })

  test("ignores when integration not found", async () => {
    findMessengerIntegrationFirst.mockResolvedValue(null)
    await run({
      action: "create_label",
      label: { id: "fb-1", page_label_name: "VIP" },
    })
    expect(insertCalls).toHaveLength(0)
  })

  test("ignores when integration sync disabled", async () => {
    findMessengerIntegrationFirst.mockResolvedValue({
      ...INTEGRATION,
      syncTagEnabledAt: null,
    })
    await run({
      action: "create_label",
      label: { id: "fb-1", page_label_name: "VIP" },
    })
    expect(insertCalls).toHaveLength(0)
  })

  test("ignores unknown action", async () => {
    await run({ action: "bogus_action", label: { id: "fb-1" } })
    expect(insertCalls).toHaveLength(0)
    expect(deleteCalls).toHaveLength(0)
  })
})

describe("handleMessengerLabelWebhook — create_label", () => {
  test("ignores create_label without page_label_name", async () => {
    await run({ action: "create_label", label: { id: "fb-1" } })
    expect(insertCalls).toHaveLength(0)
  })

  test("filters existing tag lookup by deletedAt IS NULL (avoids resurrection)", async () => {
    findTagFirst.mockResolvedValue({ id: "tag-1" })
    findTagChannelFirst.mockResolvedValue({ id: "tc-1" })
    insertReturning.mockResolvedValue([])

    await run({
      action: "create_label",
      label: { id: "fb-1", page_label_name: "VIP" },
    })

    const whereArg = (
      findTagFirst.mock.calls[0]?.[0] as { where: Record<string, unknown> }
    ).where
    expect(whereArg).toMatchObject({ deletedAt: { isNull: true } })
  })

  test("creates TagChannel mapping for a new label", async () => {
    findTagFirst.mockResolvedValue({ id: "tag-1" }) // tag already exists
    insertReturning.mockResolvedValue([{ id: "tc-new" }]) // tagChannel insert returns

    await run({
      action: "create_label",
      label: { id: "fb-99", page_label_name: "VIP" },
    })

    const tagChannelInsert = insertCalls.find(
      (c) => modelName(c.model) === "TagChannel",
    )
    expect(tagChannelInsert?.values).toMatchObject({
      tagId: "tag-1",
      externalLabelId: "fb-99",
      channelType: "messenger",
    })
  })

  test("inserts a Tag when none exists", async () => {
    findTagFirst.mockResolvedValue(null) // no existing tag
    insertReturning
      .mockResolvedValueOnce([{ id: "tag-new" }]) // tag insert
      .mockResolvedValueOnce([{ id: "tc-new" }]) // tagChannel insert

    await run({
      action: "create_label",
      label: { id: "fb-1", page_label_name: "NEW" },
    })

    const tagInsert = insertCalls.find((c) => modelName(c.model) === "Tag")
    expect(tagInsert?.values).toMatchObject({ name: "NEW", workspaceId: WS })
  })
})

describe("handleMessengerLabelWebhook — delete_label", () => {
  test("deletes TagChannel by externalLabelId", async () => {
    await run({ action: "delete_label", label: { id: "fb-1" } })

    expect(deleteCalls).toHaveLength(1)
    expect(modelName(deleteCalls[0]?.model)).toBe("TagChannel")
    const condStr = JSON.stringify(deleteCalls[0]?.condition)
    expect(condStr).toContain("fb-1")
  })
})

describe("handleMessengerLabelWebhook — add_label", () => {
  test("ignores add_label with no user", async () => {
    await run({ action: "add_label", label: { id: "fb-1" } })
    expect(insertCalls).toHaveLength(0)
  })

  test("ignores when contact inbox not found", async () => {
    findContactInboxFirst.mockResolvedValue(null)
    await run({
      action: "add_label",
      label: { id: "fb-1" },
      user: { id: "psid-1" },
    })
    expect(insertCalls).toHaveLength(0)
  })

  test("ignores when tagChannel not found", async () => {
    findContactInboxFirst.mockResolvedValue({ id: "ci-1", contactId: "c-1" })
    findTagChannelFirst.mockResolvedValue(null)
    await run({
      action: "add_label",
      label: { id: "fb-1" },
      user: { id: "psid-1" },
    })
    expect(insertCalls).toHaveLength(0)
  })

  test("inserts ContactsToTags and ContactToTagChannel when resolved", async () => {
    findContactInboxFirst.mockResolvedValue({ id: "ci-1", contactId: "c-1" })
    findTagChannelFirst.mockResolvedValue({ id: "tc-1", tagId: "tag-1" })

    await run({
      action: "add_label",
      label: { id: "fb-1" },
      user: { id: "psid-1" },
    })

    expect(insertCalls.map((c) => modelName(c.model))).toEqual([
      "ContactsToTags",
      "ContactToTagChannel",
    ])
    const ctt = insertCalls.find(
      (c) => modelName(c.model) === "ContactToTagChannel",
    )
    expect(ctt?.values).toMatchObject({
      tagId: "tag-1",
      tagChannelId: "tc-1",
      contactInboxId: "ci-1",
    })
  })
})

describe("handleMessengerLabelWebhook — remove_label", () => {
  test("ignores remove_label with no user", async () => {
    await run({ action: "remove_label", label: { id: "fb-1" } })
    expect(deleteCalls).toHaveLength(0)
  })

  test("deletes ContactToTagChannel mapping when resolved", async () => {
    findContactInboxFirst.mockResolvedValue({ id: "ci-1", contactId: "c-1" })
    findTagChannelFirst.mockResolvedValue({ id: "tc-1", tagId: "tag-1" })

    await run({
      action: "remove_label",
      label: { id: "fb-1" },
      user: { id: "psid-1" },
    })

    expect(deleteCalls).toHaveLength(1)
    expect(modelName(deleteCalls[0]?.model)).toBe("ContactToTagChannel")
    const condStr = JSON.stringify(deleteCalls[0]?.condition)
    expect(condStr).toContain("tc-1")
    expect(condStr).toContain("ci-1")
  })
})
