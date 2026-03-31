import { db, eq, findOrFail } from "@aha.chat/database/client"
import { contactModel, messageModel } from "@aha.chat/database/schema"
import type {
  ConversationModel,
  IntegrationType,
} from "@aha.chat/database/types"
import { parseErrorData, type SendFlowStepData } from "@aha.chat/sdk"
import type {
  ChatJobSendExternalMessage,
  ChatJobSendTyping,
  IntegrationJobMetadata,
} from "@aha.chat/worker-config"
import { emit, MessageEventType } from "@chatbotx.io/event-bus"
import { getInboxWithAuthFromInboxId } from "../../lib/inbox"
import { allIntegrations } from "../../lib/integrations"
import { logger } from "../../lib/logger"

export async function sendMessageToExternal(
  data: ChatJobSendExternalMessage["data"],
) {
  const { conversation, message, metadata } = data

  // Find integration auth
  const { inbox, auth } = await getInboxWithAuthFromInboxId(
    conversation.inboxId,
  )

  // Find integration detail
  const integrationDetail = allIntegrations[inbox.channel as IntegrationType]
  if (!integrationDetail) {
    logger.debug(
      `Does not support this integration for channel: ${inbox.channel}`,
    )
    return
  }

  const contact = await findOrFail(
    contactModel,
    { id: conversation.contactId },
    "Contact not found",
  )

  await integrationDetail.channels?.channel?.message?.sendMessage?.({
    ctx: {
      chatbot: inbox.chatbot,
      auth,
    },
    data: {
      contact,
      conversation,
      message,
      metadata,
    },
  })
}

export async function sendTypingToExternal(data: ChatJobSendTyping["data"]) {
  const { conversation, typing } = data

  // Find integration auth
  const { inbox, auth } = await getInboxWithAuthFromInboxId(
    conversation.inboxId,
  )

  // Find integration detail
  const integrationDetail = allIntegrations[inbox.channel as IntegrationType]
  if (!integrationDetail) {
    logger.debug(
      `Does not support this integration for channel: ${inbox.channel}`,
    )
    return
  }

  await integrationDetail.channels?.channel?.conversation?.sendTyping?.({
    ctx: {
      chatbot: inbox.chatbot,
      auth,
    },
    data: { conversation, typing },
  })
}

async function updateMessageSourceId(
  messageId: string | undefined,
  result: { messageIds?: string[] },
) {
  try {
    const firstMessageId = result?.messageIds?.[0]
    if (messageId && firstMessageId) {
      await db
        .update(messageModel)
        .set({ sourceId: firstMessageId })
        .where(eq(messageModel.id, messageId))
    }
  } catch (err) {
    logger.error(err, "Failed to update message sourceId with provider id")
  }
}

export async function sendFlowStepToExternal({
  conversation,
  flowId,
  flowVersionId,
  step,
  metadata,
  messageId,
}: {
  conversation: ConversationModel
  flowId: string
  flowVersionId?: string
  step: SendFlowStepData
  metadata?: IntegrationJobMetadata
  messageId?: string
}): Promise<{ messageIds?: string[] }> {
  // Find integration auth
  const { inbox, auth } = await getInboxWithAuthFromInboxId(
    conversation.inboxId,
  )

  // Find integration detail
  const intergationDetail = allIntegrations[inbox.channel as IntegrationType]
  if (!intergationDetail) {
    logger.error(
      `Unable to find integration detail for channel: ${inbox.channel}`,
    )
    return {}
  }

  try {
    const result = await intergationDetail.runAction("sendFlowStep", {
      ctx: {
        chatbot: inbox.chatbot,
        auth,
      },
      data: {
        conversation,
        flowId,
        flowVersionId,
        step,
        metadata,
      },
    })

    await updateMessageSourceId(messageId, result)
    await emit(MessageEventType.SENT, {
      chatbotId: inbox.chatbotId,
      contactId: conversation.contactId,
      messageId: result?.messageIds?.[0],
      conversationId: conversation.id,
      metadata,
      occurredAt: new Date(),
    })

    return result || {}
  } catch (err) {
    await emit(MessageEventType.FAILED, {
      chatbotId: inbox.chatbotId,
      contactId: conversation.contactId,
      conversationId: conversation.id,
      channel: conversation.channel,
      metadata,
      occurredAt: new Date(),
      errorData: parseErrorData(err, conversation.channel),
    })

    logger.error(err, "Failed to send flow step to external")
    return {}
  }
}
