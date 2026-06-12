import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockCreateMessageRepository,
  mockFindLastByConversation,
  mockWithCache,
} = vi.hoisted(() => ({
  mockCreateMessageRepository: vi.fn(),
  mockFindLastByConversation: vi.fn(),
  mockWithCache: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      messageModel: {
        findFirst: vi.fn(),
      },
    },
  },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  createMessageRepository: mockCreateMessageRepository,
}))

vi.mock("@chatbotx.io/redis", () => ({
  withCache: mockWithCache,
}))

const { messageService } = await import("../src/message/service")

describe("messageService.findLatestIncomingMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-06-12T00:00:00.000Z"))
    mockCreateMessageRepository.mockResolvedValue({
      findLastByConversation: mockFindLastByConversation,
    })
  })

  test("uses shard-aware repository without cache", async () => {
    const message = {
      id: "2",
      conversationId: "conversation-1",
      messageType: "incoming",
    }
    mockFindLastByConversation.mockResolvedValue([message])

    await expect(
      messageService.findLatestIncomingMessage("conversation-1"),
    ).resolves.toBe(message)

    expect(mockCreateMessageRepository).toHaveBeenCalledOnce()
    expect(mockFindLastByConversation).toHaveBeenCalledWith("conversation-1", {
      limit: 1,
      messageTypes: ["incoming"],
      sinceTime: new Date("2025-12-14T00:00:00.000Z"),
    })
    expect(mockWithCache).not.toHaveBeenCalled()

    vi.useRealTimers()
  })
})
