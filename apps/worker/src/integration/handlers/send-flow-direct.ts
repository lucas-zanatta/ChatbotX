import { db } from "@aha.chat/database/client"
import { IntegrationJobAction } from "@aha.chat/worker-config"
import { runFlowNode } from "./flow"

export interface SendFlowDirectParams {
  chatbotId: string
  contactId: string
  flowId: string
}

export async function sendFlowDirect(
  params: SendFlowDirectParams,
): Promise<Date> {
  const { flowId, chatbotId, contactId } = params

  const conversation = await db.query.conversationModel.findFirst({
    where: (c, { eq, and }) =>
      and(eq(c.contactId, contactId), eq(c.chatbotId, chatbotId)),
  })

  if (!conversation) {
    throw new Error(`Conversation not found for contact ${contactId}`)
  }

  await runFlowNode({
    type: IntegrationJobAction.sendFlow,
    data: {
      flowId,
      conversationId: conversation.id,
    },
  })

  return new Date()
}
