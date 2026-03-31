import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { contactModel, messageModel } from "@chatbotx.io/database/schema"
import type {
  ConversationModel,
  IntegrationType,
} from "@chatbotx.io/database/types"
import type { SendFlowStepData } from "@chatbotx.io/sdk"
import type {
  ChatJobSendExternalMessage,
  ChatJobSendTyping,
  IntegrationJobMetadata,
} from "@chatbotx.io/worker-config"
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

  const contact = await findOrFail({
    table: contactModel,
    where: { id: conversation.contactId },
    message: "Contact not found",
  })

  await integrationDetail.channels?.channel?.message?.sendMessage?.({
    ctx: {
      workspace: inbox.workspace,
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
      workspace: inbox.workspace,
      auth,
    },
    data: { conversation, typing },
  })
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

  const result = await intergationDetail.runAction("sendFlowStep", {
    ctx: {
      workspace: inbox.workspace,
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

  return result || {}
}
