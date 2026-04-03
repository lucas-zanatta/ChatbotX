import { db } from "@aha.chat/database/client"
import type { MetadataPayload } from "@aha.chat/flow-config"
import { IntegrationJobAction } from "@aha.chat/worker-config"
import { runFlowNode } from "./flow"

export interface SendFlowDirectParams {
  chatbotId: string
  contactId: string
  flowId: string
  metadata?: MetadataPayload
}

export async function sendFlowDirect(
  params: SendFlowDirectParams,
): Promise<Date> {
  const { flowId, chatbotId, contactId, metadata } = params

  const conversation = await db.query.conversationModel.findFirst({
    where: {
      contactId,
      chatbotId,
    },
  })

  if (!conversation) {
    throw new Error(`Conversation not found for contact ${contactId}`)
  }

  await runFlowNode({
    type: IntegrationJobAction.sendFlow,
    data: {
      flowId,
      conversationId: conversation.id,
      metadata,
    },
  })

  return new Date()
}
