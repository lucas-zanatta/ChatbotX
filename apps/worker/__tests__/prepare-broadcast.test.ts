import { beforeEach, describe, expect, test, vi } from "vitest"

const broadcastFindFirstSpy = vi.fn<() => Promise<unknown>>()
const inboxFindManySpy = vi.fn<() => Promise<unknown[]>>()
const conversationFindManySpy = vi.fn<() => Promise<unknown[]>>()
const insertSpy = vi.fn<(table: unknown) => void>()
const valuesSpy = vi.fn<(values: unknown) => unknown>()
const onConflictSpy = vi.fn<() => Promise<void>>()
const updateSpy = vi.fn<(table: unknown) => void>()
const setSpy = vi.fn<(values: Record<string, unknown>) => unknown>()
const updateWhereSpy = vi.fn<(where: unknown) => Promise<void>>()
const chunkByIdSpy =
  vi.fn<
    (
      fetcher: unknown,
      opts: { callback: (rows: unknown[]) => Promise<unknown> },
    ) => Promise<void>
  >()
const scheduleAddSpy = vi.fn<() => Promise<void>>()

vi.mock("@chatbotx.io/database/client", () => ({
  and: (...args: unknown[]) => ({ __and: args }),
  asc: (column: unknown) => ({ __asc: column }),
  eq: (column: unknown, value: unknown) => ({ __eq: [column, value] }),
  gt: (column: unknown, value: unknown) => ({ __gt: [column, value] }),
  inArray: (column: unknown, values: unknown[]) => ({
    __inArray: [column, values],
  }),
  db: {
    query: {
      broadcastModel: { findFirst: broadcastFindFirstSpy },
      inboxModel: { findMany: inboxFindManySpy },
      conversationModel: { findMany: conversationFindManySpy },
    },
    insert: (table: unknown) => {
      insertSpy(table)
      return {
        values: (values: unknown) => {
          valuesSpy(values)
          return { onConflictDoNothing: onConflictSpy }
        },
      }
    },
    update: (table: unknown) => {
      updateSpy(table)
      return {
        set: (values: Record<string, unknown>) => {
          setSpy(values)
          return { where: updateWhereSpy }
        },
      }
    },
  },
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  broadcastStatuses: { enum: { sending: "sending", sent: "sent" } },
  channelTypes: { enum: { omnichannel: "omnichannel" } },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  broadcastModel: { id: { __column: "broadcast.id" } },
  contactInboxModel: {
    id: { __column: "contactInbox.id" },
    inboxId: { __column: "contactInbox.inboxId" },
  },
  contactsOnBroadcastsModel: {},
}))

vi.mock("@chatbotx.io/database/utils", () => ({
  chunkById: chunkByIdSpy,
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  ScheduleJobData: { sendBroadcast: "sendBroadcast" },
  scheduleQueue: { add: scheduleAddSpy },
}))

beforeEach(() => {
  broadcastFindFirstSpy.mockReset()
  inboxFindManySpy.mockReset()
  inboxFindManySpy.mockResolvedValue([{ id: "inbox-1" }])
  conversationFindManySpy.mockReset()
  conversationFindManySpy.mockResolvedValue([
    { contactId: "contact-1", id: "conversation-1" },
  ])
  insertSpy.mockClear()
  valuesSpy.mockClear()
  onConflictSpy.mockReset()
  onConflictSpy.mockResolvedValue(undefined)
  updateSpy.mockClear()
  setSpy.mockClear()
  updateWhereSpy.mockReset()
  updateWhereSpy.mockResolvedValue(undefined)
  chunkByIdSpy.mockReset()
  chunkByIdSpy.mockImplementation(async (_fetcher, opts) => {
    await opts.callback([{ id: "contact-inbox-1", contactId: "contact-1" }])
  })
  scheduleAddSpy.mockReset()
  scheduleAddSpy.mockResolvedValue(undefined)
})

const scheduledBroadcast = {
  id: "broadcast-1",
  workspaceId: "workspace-1",
  integrationWhatsappId: null,
  integrationWhatsapp: null,
  channel: "omnichannel",
  flowId: "flow-1",
  templateId: null,
}

describe("prepareBroadcast", () => {
  test("inserts ContactOnBroadcast rows with an explicit column list", async () => {
    const { prepareBroadcast } = await import(
      "../src/schedule/handlers/prepare-broadcast"
    )
    broadcastFindFirstSpy.mockResolvedValue(scheduledBroadcast)

    await prepareBroadcast("broadcast-1")

    expect(valuesSpy).toHaveBeenCalledTimes(1)
    const rows = valuesSpy.mock.calls[0][0] as Record<string, unknown>[]
    expect(rows[0]).toEqual({
      broadcastId: "broadcast-1",
      contactId: "contact-1",
      contactInboxId: "contact-inbox-1",
      conversationId: "conversation-1",
    })
  })

  test("uses onConflictDoNothing to tolerate duplicate inserts", async () => {
    const { prepareBroadcast } = await import(
      "../src/schedule/handlers/prepare-broadcast"
    )
    broadcastFindFirstSpy.mockResolvedValue(scheduledBroadcast)

    await prepareBroadcast("broadcast-1")

    expect(onConflictSpy).toHaveBeenCalledTimes(1)
  })

  test("marks broadcast as sending once contacts are queued", async () => {
    const { prepareBroadcast } = await import(
      "../src/schedule/handlers/prepare-broadcast"
    )
    broadcastFindFirstSpy.mockResolvedValue(scheduledBroadcast)

    await prepareBroadcast("broadcast-1")

    expect(setSpy).toHaveBeenCalledWith({ status: "sending", contactCount: 1 })
    expect(scheduleAddSpy).toHaveBeenCalledTimes(1)
  })

  test("returns without inserting when broadcast is not found", async () => {
    const { prepareBroadcast } = await import(
      "../src/schedule/handlers/prepare-broadcast"
    )
    broadcastFindFirstSpy.mockResolvedValue(undefined)

    await prepareBroadcast("broadcast-1")

    expect(chunkByIdSpy).not.toHaveBeenCalled()
    expect(valuesSpy).not.toHaveBeenCalled()
  })
})
