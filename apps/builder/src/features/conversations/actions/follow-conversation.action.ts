"use server"

import { prisma } from "@aha.chat/database"
import { emitConversationFollowUp } from "@aha.chat/events"
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
      ctx,
    }: {
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
      ctx: { user: { id: string } }
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
          id: true,
          contactId: true,
        },
      })

      try {
        await emitConversationFollowUp(
          chatbotId,
          conversation.contactId,
          conversation.id,
          ctx.user.id,
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
