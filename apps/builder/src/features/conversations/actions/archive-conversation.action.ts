"use server"

import { prisma } from "@aha.chat/database"
import { TriggerEventEmitter } from "@aha.chat/trigger-events"
import {
  type BulkUpdateIdsRequest,
  bulkUpdateIdsRequest,
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"

export const archiveConversationAction = chatbotActionClient
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
          archivedAt: new Date(),
        },
      })

      for (const conv of conversations) {
        try {
          await TriggerEventEmitter.conversationArchived(
            chatbotId,
            conv.contactId,
          )
        } catch (error) {
          console.error("Failed to emit conversationArchived event:", error)
        }
      }

      revalidateCacheTags(`chatbots:${chatbotId}#conversations`)
    },
  )
