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

export const disableLiveChatConversationAction = chatbotActionClient
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
          id: {
            in: parsedInput.ids,
          },
          chatbotId,
        },
        select: {
          id: true,
          contactId: true,
        },
      })

      await prisma.conversation.updateMany({
        where: {
          id: {
            in: parsedInput.ids,
          },
          chatbotId,
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

      revalidateCacheTags([
        `chatbots:${chatbotId}#conversations`,
        ...parsedInput.ids.map(
          (id) => `chatbots:${chatbotId}#conversations:${id}`,
        ),
      ])
    },
  )
