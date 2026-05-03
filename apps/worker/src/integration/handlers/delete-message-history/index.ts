import { aiContextStore } from "@chatbotx.io/ai/server"
import { db, eq } from "@chatbotx.io/database/client"
import { conversationModel } from "@chatbotx.io/database/schema"
import type { AIDeleteMessageHistorySchema } from "@chatbotx.io/flow-config"
import type { ExecuteStepProps } from "../flow"

export async function handleAIDeleteMessageHistory({
  conversation,
}: ExecuteStepProps<AIDeleteMessageHistorySchema>) {
  const latestMessage = await db.query.messageModel.findFirst({
    where: {
      conversationId: conversation.id,
    },
    columns: {
      id: true,
    },
    orderBy: (table, { desc }) => [desc(table.createdAt), desc(table.id)],
  })

  await db
    .update(conversationModel)
    .set({
      aiContextLastMessageId: latestMessage?.id ?? null,
    })
    .where(eq(conversationModel.id, conversation.id))

  await aiContextStore.delete(conversation.id)
}
