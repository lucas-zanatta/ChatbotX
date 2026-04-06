import { db, eq } from "@chatbotx.io/database/client"
import { conversationModel } from "@chatbotx.io/database/schema"
import { emit } from "@chatbotx.io/event-bus"
import { MessageEventType } from "@chatbotx.io/flow-config"
import {
  broadcastToWorkspaceParty,
  RealtimeEventType,
} from "@chatbotx.io/partysocket-config"
import type {
  IntegrationJobAgentMarkAsRead,
  IntegrationJobAssignConversation,
  IntegrationJobContactMarkAsRead,
} from "@chatbotx.io/worker-config"
import { getInboxWithAuthFromInboxId } from "../../lib/inbox"

export const broadcastAssignConversation = async (
  props: IntegrationJobAssignConversation["data"],
) => {
  const { conversations } = props
  const { inbox } = await getInboxWithAuthFromInboxId(conversations[0].inboxId)

  await broadcastToWorkspaceParty(inbox.workspaceId, {
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

  await emit(MessageEventType["message:seen"], {
    workspaceId: conversation.workspaceId,
    contactId: conversation.contactId,
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
