import { db, eq } from "@aha.chat/database/client"
import { conversationModel } from "@aha.chat/database/schema"
import {
  broadcastToChatbotParty,
  RealtimeEventType,
} from "@aha.chat/partysocket-config"
import type {
  IntegrationJobAgentMarkAsRead,
  IntegrationJobAssignConversation,
  IntegrationJobContactMarkAsRead,
} from "@aha.chat/worker-config"
import { emit, MessageEventType } from "@chatbotx.io/event-bus"
import { getInboxWithAuthFromInboxId } from "../../lib/inbox"

export const broadcastAssignConversation = async (
  props: IntegrationJobAssignConversation["data"],
) => {
  const { conversations } = props
  const { inbox } = await getInboxWithAuthFromInboxId(conversations[0].inboxId)

  await broadcastToChatbotParty(inbox.chatbotId, {
    eventType: RealtimeEventType.conversationAssigned,
    data: {
      conversationIds: conversations.map((c) => c.id),
      assignedUserId: conversations[0].assignedUserId,
      assignedInboxTeamId: conversations[0].assignedInboxTeamId,
    },
  })
}

export const contactMarkAsRead = async (
  props: IntegrationJobContactMarkAsRead["data"],
) => {
  const { sourceConversationId, integrationType } = props

  const conversation = await db.query.conversationModel.findFirst({
    where: { sourceId: sourceConversationId },
    with: {
      contact: true,
      inbox: true,
    },
  })

  if (!conversation) {
    return
  }

  await db
    .update(conversationModel)
    .set({
      contactLastReadAt: new Date(),
    })
    .where(eq(conversationModel.sourceId, sourceConversationId))

  emit(MessageEventType.SEEN, {
    chatbotId: conversation.inbox.chatbotId,
    contactId: conversation.contact.id,
    conversationId: conversation.id,
    channel: integrationType,
    occurredAt: new Date(),
  })
}

export const agentMarkAsRead = async (
  _props: IntegrationJobAgentMarkAsRead["data"],
) => {
  // TODO: Implement
}
