import { db, eq, findOrFail } from "@aha.chat/database/client"
import { contactModel, messageModel } from "@aha.chat/database/schema"
import type {
  ConversationModel,
  IntegrationType,
} from "@aha.chat/database/types"
import type { MetadataPayload } from "@aha.chat/flow-config"
import { parseSdkError, type SendFlowStepData } from "@aha.chat/sdk"
import type {
  ChatJobSendExternalMessage,
  ChatJobSendTyping,
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
  metadata?: MetadataPayload
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

  const eventLogData = {
    chatbotId: inbox.chatbotId,
    contactId: conversation.contactId,
    conversationId: conversation.id,
    channel: inbox.channel,
    metadata,
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
      ...eventLogData,
      messageId: result?.messageIds?.[0],
      occurredAt: new Date(),
    })

    return result || {}
  } catch (err) {
    await emit(MessageEventType.FAILED, {
      ...eventLogData,
      errorData: await parseSdkError(err),
      occurredAt: new Date(),
    })

    throw err
  }
}
