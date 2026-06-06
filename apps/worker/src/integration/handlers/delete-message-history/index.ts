import { aiContextStore } from "@chatbotx.io/ai/server"
import { db, eq, sql } from "@chatbotx.io/database/client"
import { conversationModel, messageModel } from "@chatbotx.io/database/schema"
import type { AIDeleteMessageHistorySchema } from "@chatbotx.io/flow-config"
import type { ExecuteStepProps } from "../flow"
import type { ExecuteStepResult } from "../step"

export async function handleAIDeleteMessageHistory({
  conversation,
}: ExecuteStepProps<AIDeleteMessageHistorySchema>): Promise<ExecuteStepResult> {
  await db
    .update(conversationModel)
    .set({
      aiContextLastMessageId: sql`(
        SELECT ${messageModel.id} FROM ${messageModel}
        WHERE ${messageModel.conversationId} = ${conversation.id}
        ORDER BY ${messageModel.createdAt} DESC, ${messageModel.id} DESC
        LIMIT 1
      )`,
    })
    .where(eq(conversationModel.id, conversation.id))

  await aiContextStore.delete(conversation.id)

  return { status: "success", result: null }
}
