"use server"

import { and, db, eq, inArray } from "@aha.chat/database/client"
import { conversationModel } from "@aha.chat/database/schema"
import { emitConversationArchived } from "@aha.chat/events"
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
      ctx,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: BulkUpdateIdsRequest
      ctx: { user: { id: string } }
    }) => {
      // Get conversations first for event emission
      const conversations = await db.query.conversationModel.findMany({
        where: {
          chatbotId,
          id: { in: parsedInput.ids },
        },
        columns: {
          id: true,
          contactId: true,
        },
      })

      await db
        .update(conversationModel)
        .set({
          archivedAt: new Date(),
        })
        .where(
          and(
            eq(conversationModel.chatbotId, chatbotId),
            inArray(conversationModel.id, parsedInput.ids),
          ),
        )

      for (const conv of conversations) {
        try {
          await emitConversationArchived(
            chatbotId,
            conv.contactId,
            conv.id,
            ctx.user.id,
          )
        } catch (error) {
          console.error("Failed to emit conversationArchived event:", error)
        }
      }

      revalidateCacheTags(`chatbots:${chatbotId}#conversations`)
    },
  )
