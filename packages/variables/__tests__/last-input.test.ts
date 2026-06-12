import { contentTypes } from "@chatbotx.io/database/partials"
import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockFindConversationBy, mockFindLatestIncomingMessage } = vi.hoisted(
  () => ({
    mockFindConversationBy: vi.fn(),
    mockFindLatestIncomingMessage: vi.fn(),
  }),
)

vi.mock("@chatbotx.io/business", () => ({
  conversationService: {
    findBy: mockFindConversationBy,
  },
  messageService: {
    findLatestIncomingMessage: mockFindLatestIncomingMessage,
  },
}))

const { getContactLastInput, getContactLastInputType } = await import(
  "../src/helpers/last-input"
)

describe("last input helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindConversationBy.mockResolvedValue({ id: "conversation-1" })
  })

  test("last_input returns latest text message text", async () => {
    mockFindLatestIncomingMessage.mockResolvedValue({
      contentType: contentTypes.enum.text,
      text: "latest incoming text",
    })

    await expect(getContactLastInput("contact-1")).resolves.toBe(
      "latest incoming text",
    )
    expect(mockFindLatestIncomingMessage).toHaveBeenCalledWith("conversation-1")
  })

  test("last_input returns Attached File for non-text messages", async () => {
    mockFindLatestIncomingMessage.mockResolvedValue({
      contentType: contentTypes.enum.location,
      text: null,
    })

    await expect(getContactLastInput("contact-1")).resolves.toBe(
      "Attached File",
    )
  })

  test("last_input and last_input_type return null when no message exists", async () => {
    mockFindLatestIncomingMessage.mockResolvedValue(null)

    await expect(getContactLastInput("contact-1")).resolves.toBeNull()
    await expect(getContactLastInputType("contact-1")).resolves.toBeNull()
  })

  test("last_input_type returns latest message content type", async () => {
    mockFindLatestIncomingMessage.mockResolvedValue({
      contentType: contentTypes.enum.text,
      text: "latest incoming text",
    })

    await expect(getContactLastInputType("contact-1")).resolves.toBe(
      contentTypes.enum.text,
    )
  })
})
