import { contentTypes, messageTypes } from "@chatbotx.io/sdk"
import { describe, expect, test } from "vitest"
import { receiveMessage } from "../src/handlers/message/incomming-message"

describe("Instagram comment webhook", () => {
  test("maps comment changes to an incoming message and contact", async () => {
    const result = await receiveMessage({
      ctx: {},
      data: {
        integrationType: "instagram",
        integrationIdentifier: "17841404686101580",
        payload: {
          object: "instagram",
          entry: [
            {
              id: "17841404686101580",
              time: 1_765_000_000,
              changes: [
                {
                  field: "comments",
                  value: {
                    id: "comment-1",
                    text: "Quero saber mais",
                    media: { id: "media-1" },
                    from: {
                      id: "user-1",
                      username: "lead_user",
                    },
                  },
                },
              ],
            },
          ],
        },
      },
    })

    expect(result.contact).toEqual({
      sourceId: "user-1",
      firstName: "lead_user",
      sourceConversationId: "media-1",
    })
    expect(result.message).toMatchObject({
      sourceId: "comment-1",
      messageType: messageTypes.enum.incoming,
      contentType: contentTypes.enum.text,
      text: "Quero saber mais",
      contentAttributes: {
        type: "instagram_comment",
        commentId: "comment-1",
        mediaId: "media-1",
        username: "lead_user",
      },
    })
  })
})
