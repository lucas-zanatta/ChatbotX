import type { Context } from "@chatbotx.io/sdk"
import { DEFAULT_API_VERSION } from "../constants"
import { MessengerAPIException } from "../exception"
import { facebookGraphClient } from "../lib/http-client"
import { logger } from "../lib/logger"
import type { MessengerAuthValue } from "../schema"

export type MessengerMessageTemplateEntity = {
  id: string
  name: string
  status: "APPROVED" | "PENDING" | "REJECTED"
  language: string
  category: string
  components: unknown[]
}

export type ListMessengerMessageTemplatesResponse = {
  data: MessengerMessageTemplateEntity[]
  paging?: {
    next?: string
    previous?: string
  }
}

export const listMessageTemplates = async (
  ctx: Context<MessengerAuthValue>,
): Promise<ListMessengerMessageTemplatesResponse> => {
  const { version = DEFAULT_API_VERSION } = ctx.auth
  const all: MessengerMessageTemplateEntity[] = []
  let nextUrl: string | undefined = `${version}/me/message_templates?limit=100`

  try {
    while (nextUrl) {
      const response: ListMessengerMessageTemplatesResponse =
        await facebookGraphClient.get<ListMessengerMessageTemplatesResponse>(
          nextUrl,
          {
            headers: {
              Authorization: `Bearer ${ctx.auth.tokens.accessToken}`,
            },
          },
        )

      all.push(...response.data)
      nextUrl = response.paging?.next
    }

    return { data: all }
  } catch (error) {
    logger.error(error, "Failed to list messenger message templates")
    throw new MessengerAPIException(
      "Failed to list messenger message templates",
      `${version}/me/message_templates`,
    ).setOriginError(error)
  }
}
