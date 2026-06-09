import { beforeEach, describe, expect, test, vi } from "vitest"

const broadcastFindManySpy = vi.fn<() => Promise<unknown[]>>()
const cobFindManySpy = vi.fn<() => Promise<unknown[]>>()
const updateSpy = vi.fn<(table: unknown) => unknown>()
const setSpy = vi.fn<(values: Record<string, unknown>) => unknown>()
const whereSpy = vi.fn<(where: unknown) => Promise<void>>()
const chatQueueAddSpy = vi.fn<() => Promise<void>>()
const integrationQueueAddSpy = vi.fn<() => Promise<void>>()

vi.mock("@chatbotx.io/database/client", () => ({
  and: (...args: unknown[]) => ({ __and: args }),
  db: {
    query: {
      broadcastModel: {
        findMany: broadcastFindManySpy,
      },
      contactsOnBroadcastsModel: {
        findMany: cobFindManySpy,
      },
    },
    update: (table: unknown) => {
      updateSpy(table)
      return {
        set: (values: Record<string, unknown>) => {
          setSpy(values)
          return {
            where: (where: unknown) => whereSpy(where),
          }
        },
      }
    },
  },
  eq: (column: unknown, value: unknown) => ({ __eq: [column, value] }),
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  broadcastStatuses: { enum: { sending: "sending" } },
  channelTypes: { enum: { messenger: "messenger" } },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  broadcastModel: {
    id: { __column: "broadcast.id" },
  },
  contactsOnBroadcastsModel: {
    broadcastId: { __column: "cob.broadcastId" },
    contactId: { __column: "cob.contactId" },
  },
}))

vi.mock("@chatbotx.io/flow-config", () => ({
  BROADCAST_PAYLOAD_TYPE: "broadcast",
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  ChatJobAction: {
    sendMessengerTemplateMessage: "sendMessengerTemplateMessage",
    sendWhatsappTemplateMessage: "sendWhatsappTemplateMessage",
  },
  chatQueue: { add: chatQueueAddSpy },
  IntegrationJobAction: { sendFlow: "sendFlow" },
  integrationQueue: { add: integrationQueueAddSpy },
}))

vi.mock("../src/lib/logger", () => ({
  logger: { error: vi.fn() },
}))

beforeEach(() => {
  broadcastFindManySpy.mockReset()
  cobFindManySpy.mockReset()
  updateSpy.mockClear()
  setSpy.mockClear()
  whereSpy.mockClear()
  chatQueueAddSpy.mockReset()
  chatQueueAddSpy.mockResolvedValue(undefined)
  integrationQueueAddSpy.mockReset()
  integrationQueueAddSpy.mockResolvedValue(undefined)
})

describe("processBroadcastContacts", () => {
  test("selects contacts on broadcast with broadcastId and sent=false", async () => {
    const { processBroadcastContacts } = await import(
      "../src/schedule/handlers/process-broadcast-contacts"
    )
    broadcastFindManySpy.mockResolvedValue([{ id: "broadcast-1" }])
    cobFindManySpy.mockResolvedValue([])

    await processBroadcastContacts()

    expect(cobFindManySpy).toHaveBeenCalledWith({
      where: {
        broadcastId: "broadcast-1",
        sent: false,
      },
      with: {
        conversation: true,
        contactInbox: true,
      },
      limit: 500,
    })
  })

  test("updates contacts on broadcast with broadcastId and contactId filters", async () => {
    const { processBroadcastContacts } = await import(
      "../src/schedule/handlers/process-broadcast-contacts"
    )
    broadcastFindManySpy.mockResolvedValue([
      { id: "broadcast-1", flowId: "flow-1" },
    ])
    cobFindManySpy.mockResolvedValue([
      {
        broadcastId: "broadcast-1",
        contactId: "contact-1",
        contactInboxId: "contact-inbox-1",
        conversationId: "conversation-1",
      },
    ])

    await processBroadcastContacts()

    expect(whereSpy).toHaveBeenCalledWith({
      __and: [
        { __eq: [{ __column: "cob.broadcastId" }, "broadcast-1"] },
        { __eq: [{ __column: "cob.contactId" }, "contact-1"] },
      ],
    })
  })

  test("marks broadcast sent when there are no unsent contacts", async () => {
    const { processBroadcastContacts } = await import(
      "../src/schedule/handlers/process-broadcast-contacts"
    )
    broadcastFindManySpy.mockResolvedValue([{ id: "broadcast-1" }])
    cobFindManySpy.mockResolvedValue([])

    await processBroadcastContacts()

    expect(setSpy).toHaveBeenCalledWith({ status: "sent" })
    expect(whereSpy).toHaveBeenCalledWith({
      __eq: [{ __column: "broadcast.id" }, "broadcast-1"],
    })
  })
})
