import { beforeEach, describe, expect, test, vi } from "vitest"

// ── query spies ───────────────────────────────────────────────────────────────
const findZaloIntegrationFirst = vi.fn()
const findTagFirst = vi.fn()
const findTagChannelFirst = vi.fn()
const findManyContactInboxes = vi.fn()

// ── mutation spies ────────────────────────────────────────────────────────────
const insertCalls: Array<{ model: unknown; values: unknown }> = []
const deleteCalls: Array<{ model: unknown; condition: unknown }> = []
const insertReturning = vi.fn()

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      integrationZaloModel: {
        findFirst: (...args: unknown[]) => findZaloIntegrationFirst(...args),
      },
      tagModel: { findFirst: (...args: unknown[]) => findTagFirst(...args) },
      tagChannelModel: {
        findFirst: (...args: unknown[]) => findTagChannelFirst(...args),
      },
      contactInboxModel: {
        findMany: (...args: unknown[]) => findManyContactInboxes(...args),
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
  inArray: (col: unknown, vals: unknown) => ({ inArray: [col, vals] }),
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

const { handleZaloLabelWebhook } = await import(
  "../src/integration/handlers/zalo-label-webhook"
)

const OA_ID = "oa-1"
const WS = "ws-1"
const INTEGRATION = {
  id: "zint-1",
  oaId: OA_ID,
  inboxId: "zinbox-1",
  workspaceId: WS,
  syncTagEnabledAt: new Date(),
}

const run = (payload: Record<string, unknown>) =>
  handleZaloLabelWebhook({
    integrationIdentifier: OA_ID,
    integrationType: "zalo",
    payload,
  })

const modelName = (m: unknown) => (m as { __name: string }).__name

beforeEach(() => {
  findZaloIntegrationFirst.mockReset()
  findTagFirst.mockReset()
  findTagChannelFirst.mockReset()
  findManyContactInboxes.mockReset()
  insertReturning.mockReset()
  insertCalls.length = 0
  deleteCalls.length = 0

  findZaloIntegrationFirst.mockResolvedValue(INTEGRATION)
  insertReturning.mockResolvedValue([{ id: "generated-id" }])
})

describe("handleZaloLabelWebhook — guards", () => {
  test("ignores invalid payload", async () => {
    await run({ not: "valid" })
    expect(findZaloIntegrationFirst).not.toHaveBeenCalled()
  })

  test("ignores when user_ids exceeds 200 (DoS guard)", async () => {
    const tooMany = Array.from({ length: 201 }, (_, i) => `u-${i}`)
    await run({
      event_name: "add_user_to_tag",
      oa_id: OA_ID,
      tag: { name: "VIP", user_ids: tooMany },
    })
    // schema parse fails → integration never queried
    expect(findZaloIntegrationFirst).not.toHaveBeenCalled()
  })

  test("accepts exactly 200 user_ids", async () => {
    const exactly = Array.from({ length: 200 }, (_, i) => `u-${i}`)
    findTagFirst.mockResolvedValue({ id: "tag-1" })
    findTagChannelFirst.mockResolvedValue({ id: "tc-1" })
    findManyContactInboxes.mockResolvedValue([])
    insertReturning.mockResolvedValue([{ id: "tc-1" }])

    await run({
      event_name: "add_user_to_tag",
      oa_id: OA_ID,
      tag: { name: "VIP", user_ids: exactly },
    })

    expect(findZaloIntegrationFirst).toHaveBeenCalled()
  })

  test("ignores when integration not found", async () => {
    findZaloIntegrationFirst.mockResolvedValue(null)
    await run({ event_name: "remove_tag", oa_id: OA_ID, tag: { name: "VIP" } })
    expect(deleteCalls).toHaveLength(0)
  })

  test("ignores when sync disabled", async () => {
    findZaloIntegrationFirst.mockResolvedValue({
      ...INTEGRATION,
      syncTagEnabledAt: null,
    })
    await run({ event_name: "remove_tag", oa_id: OA_ID, tag: { name: "VIP" } })
    expect(deleteCalls).toHaveLength(0)
  })
})

describe("handleZaloLabelWebhook — remove_tag", () => {
  test("deletes TagChannel by externalLabelId (tag name)", async () => {
    await run({ event_name: "remove_tag", oa_id: OA_ID, tag: { name: "VIP" } })

    expect(deleteCalls).toHaveLength(1)
    expect(modelName(deleteCalls[0]?.model)).toBe("TagChannel")
    const condStr = JSON.stringify(deleteCalls[0]?.condition)
    expect(condStr).toContain("VIP")
  })
})

describe("handleZaloLabelWebhook — add_user_to_tag", () => {
  test("label-only create when user_ids missing", async () => {
    findTagFirst.mockResolvedValue({ id: "tag-1" })
    insertReturning.mockResolvedValue([{ id: "tc-1" }])

    await run({
      event_name: "add_user_to_tag",
      oa_id: OA_ID,
      tag: { name: "VIP" },
    })

    // ensureTagAndChannel ran; no contact mapping inserts
    expect(findManyContactInboxes).not.toHaveBeenCalled()
  })

  test("existing tag lookup filters by deletedAt IS NULL", async () => {
    findTagFirst.mockResolvedValue({ id: "tag-1" })
    insertReturning.mockResolvedValue([{ id: "tc-1" }])

    await run({
      event_name: "add_user_to_tag",
      oa_id: OA_ID,
      tag: { name: "VIP" },
    })

    const whereArg = (
      findTagFirst.mock.calls[0]?.[0] as { where: Record<string, unknown> }
    ).where
    expect(whereArg).toMatchObject({ deletedAt: { isNull: true } })
  })

  test("inserts ContactsToTags and ContactToTagChannel for matched users", async () => {
    findTagFirst.mockResolvedValue({ id: "tag-1" })
    insertReturning.mockResolvedValue([{ id: "tc-1" }])
    findManyContactInboxes.mockResolvedValue([
      { id: "ci-1", contactId: "c-1" },
      { id: "ci-2", contactId: "c-2" },
    ])

    await run({
      event_name: "add_user_to_tag",
      oa_id: OA_ID,
      tag: { name: "VIP", user_ids: ["u-1", "u-2"] },
    })

    const models = insertCalls.map((c) => modelName(c.model))
    expect(models).toContain("ContactsToTags")
    expect(models).toContain("ContactToTagChannel")
  })

  test("returns early when no contact inboxes match user_ids", async () => {
    findTagFirst.mockResolvedValue({ id: "tag-1" })
    insertReturning.mockResolvedValue([{ id: "tc-1" }])
    findManyContactInboxes.mockResolvedValue([])

    await run({
      event_name: "add_user_to_tag",
      oa_id: OA_ID,
      tag: { name: "VIP", user_ids: ["u-1"] },
    })

    // ensureTagAndChannel inserts may run, but no contact-mapping inserts
    const models = insertCalls.map((c) => modelName(c.model))
    expect(models).not.toContain("ContactsToTags")
    expect(models).not.toContain("ContactToTagChannel")
  })
})

describe("handleZaloLabelWebhook — remove_user_from_tag", () => {
  test("returns early when user_ids empty", async () => {
    await run({
      event_name: "remove_user_from_tag",
      oa_id: OA_ID,
      tag: { name: "VIP", user_ids: [] },
    })
    expect(deleteCalls).toHaveLength(0)
  })

  test("returns early when tagChannel not found", async () => {
    findTagChannelFirst.mockResolvedValue(null)
    await run({
      event_name: "remove_user_from_tag",
      oa_id: OA_ID,
      tag: { name: "VIP", user_ids: ["u-1"] },
    })
    expect(deleteCalls).toHaveLength(0)
  })

  test("returns early when no contact inboxes match", async () => {
    findTagChannelFirst.mockResolvedValue({ id: "tc-1" })
    findManyContactInboxes.mockResolvedValue([])
    await run({
      event_name: "remove_user_from_tag",
      oa_id: OA_ID,
      tag: { name: "VIP", user_ids: ["u-1"] },
    })
    expect(deleteCalls).toHaveLength(0)
  })

  test("deletes ContactToTagChannel for matched users", async () => {
    findTagChannelFirst.mockResolvedValue({ id: "tc-1" })
    findManyContactInboxes.mockResolvedValue([{ id: "ci-1" }, { id: "ci-2" }])

    await run({
      event_name: "remove_user_from_tag",
      oa_id: OA_ID,
      tag: { name: "VIP", user_ids: ["u-1", "u-2"] },
    })

    expect(deleteCalls).toHaveLength(1)
    expect(modelName(deleteCalls[0]?.model)).toBe("ContactToTagChannel")
    const condStr = JSON.stringify(deleteCalls[0]?.condition)
    expect(condStr).toContain("ci-1")
    expect(condStr).toContain("ci-2")
  })
})
