"use server"

import { prisma } from "@aha.chat/database"
import { emitConversationTransferredToBot } from "@aha.chat/events"
import {
  type BulkUpdateIdsRequest,
  bulkUpdateIdsRequest,
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"

export const enableBotAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(bulkUpdateIdsRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: BulkUpdateIdsRequest
    }) => {
      const conversations = await prisma.conversation.findMany({
        where: {
          chatbotId,
          id: {
            in: parsedInput.ids,
          },
        },
        select: {
          id: true,
          contactId: true,
        },
      })

      await prisma.conversation.updateMany({
        where: {
          chatbotId,
          id: {
            in: parsedInput.ids,
          },
        },
        data: {
          liveChatEnabled: false,
        },
      })

      for (const conv of conversations) {
        try {
          await emitConversationTransferredToBot(chatbotId, conv.contactId)
        } catch (error) {
          console.error(
            "Failed to emit conversationTransferredToBot event:",
            error,
          )
        }
      }

      revalidateCacheTags(`chatbots:${chatbotId}#conversations`)
    },
  )
