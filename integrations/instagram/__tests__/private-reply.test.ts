import { buttonTypes, stepTypes } from "@chatbotx.io/flow-config"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { sendFlowStep } from "../src/handlers/message/outgoing-message"

const mocks = vi.hoisted(() => ({
  sendInstagramMessage: vi.fn(),
  sendInstagramPrivateReply: vi.fn(),
}))

vi.mock("../src/apis/page", () => ({
  sendInstagramMessage: mocks.sendInstagramMessage,
  sendInstagramPrivateReply: mocks.sendInstagramPrivateReply,
}))

const ctx = {
  auth: {
    authType: "oauth2",
    tokens: { accessToken: "token" },
    metadata: {
      version: "v25.0",
      igId: "ig-1",
      igName: "Facil",
      pageId: "page-1",
    },
  },
}

const contact = {
  id: "contact-inbox-1",
  sourceId: "user-1",
  contactId: "contact-1",
  channel: "instagram",
}

describe("Instagram private replies", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.sendInstagramPrivateReply.mockResolvedValue({ id: "reply-1" })
    mocks.sendInstagramMessage.mockResolvedValue({ recipient_id: "user-1" })
  })

  test("uses private reply for flow steps triggered by Instagram comments", async () => {
    await sendFlowStep({
      ctx,
      data: {
        contact,
        flowId: "flow-1",
        step: {
          id: "step-1",
          nodeId: "node-1",
          stepType: stepTypes.enum.sendText,
          text: "Aqui esta o link",
          buttons: [
            {
              id: "button-1",
              label: "Ver imoveis",
              buttonType: buttonTypes.enum.openWebsite,
              beforeStep: { url: "https://facilimoveisitapoa.com.br/imoveis" },
            },
          ],
        },
        channelContext: {
          instagramPrivateReplyCommentId: "comment-1",
        },
      },
    } as Parameters<typeof sendFlowStep>[0])

    expect(mocks.sendInstagramPrivateReply).toHaveBeenCalledWith(
      ctx.auth,
      "comment-1",
      {
        message:
          "Aqui esta o link\n\nVer imoveis: https://facilimoveisitapoa.com.br/imoveis",
      },
    )
    expect(mocks.sendInstagramMessage).not.toHaveBeenCalled()
  })
})
