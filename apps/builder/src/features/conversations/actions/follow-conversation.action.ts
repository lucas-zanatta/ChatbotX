"use server"

import { prisma } from "@aha.chat/database"
import { TriggerEventEmitter } from "@aha.chat/trigger-events"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"

export const followConversationAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId, id],
    }: {
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
    }) => {
      const conversation = await prisma.conversation.update({
        where: {
          id,
          chatbotId,
        },
        data: {
          followed: true,
        },
        select: {
          contactId: true,
        },
      })

      try {
        await TriggerEventEmitter.conversationFollowUp(
          chatbotId,
          conversation.contactId,
        )
      } catch (error) {
        console.error("Failed to emit conversationFollowUp event:", error)
      }

      revalidateCacheTags([
        `chatbots:${chatbotId}#contacts`,
        `chatbots:${chatbotId}#conversations`,
      ])
    },
  )
