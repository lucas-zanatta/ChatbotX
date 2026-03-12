import { and, db, eq } from "@aha.chat/database/client"
import {
  chatbotMemberModel,
  conversationModel,
  inboxTeamModel,
} from "@aha.chat/database/schema"
import {
  emitConversationArchived,
  emitConversationAssigned,
  emitConversationFollowUp,
  emitConversationTransferredToBot,
  emitConversationTransferredToHuman,
  emitConversationUnassigned,
} from "@aha.chat/events"
import {
  type ArchiveConversationStepSchema,
  type AssignConversationStepSchema,
  AutoAssignConversationRule,
  type AutoAssignConversationStepSchema,
  type DisableBotStepSchema,
  type EnableBotStepSchema,
  type FollowConversationStepSchema,
  type UnarchiveConversationStepSchema,
  type UnassignConversationStepSchema,
  type UnfollowConversationStepSchema,
} from "@aha.chat/flow-config"
import { subHours } from "date-fns"
import type { ExecuteStepProps } from "./flow"

export async function archiveConversation({
  conversation,
}: ExecuteStepProps<ArchiveConversationStepSchema>) {
  await db
    .update(conversationModel)
    .set({ archivedAt: new Date() })
    .where(eq(conversationModel.id, conversation.id))

  try {
    await emitConversationArchived(
      conversation.chatbotId,
      conversation.contactId,
      conversation.id,
      "system",
    )
  } catch (error) {
    console.error("Failed to emit conversationArchived event:", error)
  }
}

export async function unarchiveConversation({
  conversation,
}: ExecuteStepProps<UnarchiveConversationStepSchema>) {
  await db
    .update(conversationModel)
    .set({ archivedAt: null })
    .where(eq(conversationModel.id, conversation.id))
}

export async function assignConversation({
  conversation,
  step,
}: ExecuteStepProps<AssignConversationStepSchema>) {
  let assigned = false

  if (step.assignedId.startsWith("u_")) {
    const userId = step.assignedId.substring(2)
    const [chatbotMember] = await db
      .select()
      .from(chatbotMemberModel)
      .where(
        and(
          eq(chatbotMemberModel.userId, userId),
          eq(chatbotMemberModel.chatbotId, conversation.chatbotId),
        ),
      )
      .limit(1)
    if (chatbotMember) {
      await db
        .update(conversationModel)
        .set({ assignedUserId: userId })
        .where(eq(conversationModel.id, conversation.id))
      assigned = true
    }
  } else if (step.assignedId.startsWith("t_")) {
    const inboxTeamId = step.assignedId.substring(2)
    const [inboxTeam] = await db
      .select()
      .from(inboxTeamModel)
      .where(
        and(
          eq(inboxTeamModel.id, inboxTeamId),
          eq(inboxTeamModel.chatbotId, conversation.chatbotId),
        ),
      )
      .limit(1)
    if (inboxTeam) {
      await db
        .update(conversationModel)
        .set({ assignedInboxTeamId: inboxTeamId })
        .where(eq(conversationModel.id, conversation.id))
      assigned = true
    }
  }

  if (assigned) {
    try {
      await emitConversationAssigned(
        conversation.chatbotId,
        conversation.contactId,
        conversation.id,
        step.assignedId,
        "system",
      )
    } catch (error) {
      console.error("Failed to emit conversationAssigned event:", error)
    }
  }
}

export async function autoAssignConversation({
  conversation,
  step,
}: ExecuteStepProps<AutoAssignConversationStepSchema>) {
  if (step.assignedIds.length === 0) {
    return
  }

  const userIds: string[] = []
  const inboxTeamIds: string[] = []
  for (const id of step.assignedIds) {
    if (id.startsWith("u_")) {
      userIds.push(id.substring(2))
    } else if (id.startsWith("t_")) {
      inboxTeamIds.push(id.substring(2))
    }
  }

  let timeFilter: ReturnType<typeof gte> | undefined
  switch (step.rule) {
    case AutoAssignConversationRule.LAST_HOUR: {
      timeFilter = gte(conversationModel.createdAt, subHours(new Date(), 1))
      break
    }
    case AutoAssignConversationRule.LAST_8HOURS: {
      timeFilter = gte(conversationModel.createdAt, subHours(new Date(), 8))
      break
    }
    case AutoAssignConversationRule.LAST_24HOURS: {
      timeFilter = gte(conversationModel.createdAt, subHours(new Date(), 24))
      break
    }
    default:
      break
  }

  // Init assignee map
  const allocation: Record<
    string,
    {
      assignedUserId: string | null
      assignedInboxTeamId: string | null
      count: number
    }
  > = {}

  let requiredUsers: { userId: string }[] = []
  if (userIds.length > 0) {
    requiredUsers = await db
      .select({ userId: chatbotMemberModel.userId })
      .from(chatbotMemberModel)
      .where(
        and(
          eq(chatbotMemberModel.chatbotId, conversation.chatbotId),
          inArray(chatbotMemberModel.id, userIds),
        ),
      )
    for (const u of requiredUsers) {
      allocation[`u_${u.userId}`] = {
        assignedUserId: u.userId,
        assignedInboxTeamId: null,
        count: 0,
      }
    }
  }

  let requiredInboxTeams: { id: string }[] = []
  if (inboxTeamIds.length > 0) {
    requiredInboxTeams = await db
      .select({ id: inboxTeamModel.id })
      .from(inboxTeamModel)
      .where(
        and(
          eq(inboxTeamModel.chatbotId, conversation.chatbotId),
          inArray(inboxTeamModel.id, inboxTeamIds),
        ),
      )
    for (const t of requiredInboxTeams) {
      allocation[`t_${t.id}`] = {
        assignedUserId: null,
        assignedInboxTeamId: t.id,
        count: 0,
      }
    }
  }

  if (Object.keys(allocation).length === 0) {
    return
  }

  // Count conversations of assignee during time
  const conversationCount = await db
    .select({
      assignedUserId: conversationModel.assignedUserId,
      assignedInboxTeamId: conversationModel.assignedInboxTeamId,
      count: sql<number>`count(${conversationModel.id})::int`,
    })
    .from(conversationModel)
    .where(
      and(
        or(
          inArray(
            conversationModel.assignedUserId,
            requiredUsers.map((r) => r.userId),
          ),
          inArray(
            conversationModel.assignedInboxTeamId,
            requiredInboxTeams.map((r) => r.id),
          ),
        ),
        timeFilter,
      ),
    )
    .groupBy(
      conversationModel.assignedUserId,
      conversationModel.assignedInboxTeamId,
    )
  for (const cc of conversationCount) {
    if (cc.assignedUserId && allocation[`u_${cc.assignedUserId}`]) {
      allocation[`u_${cc.assignedUserId}`].count = cc.count
    }

    if (cc.assignedInboxTeamId && allocation[`t_${cc.assignedInboxTeamId}`]) {
      allocation[`t_${cc.assignedInboxTeamId}`].count = cc.count
    }
  }

  // Choose object has smallest count
  let smallestCount = Number.POSITIVE_INFINITY
  let smallestKey = ""
  for (const aa in allocation) {
    if (smallestCount > allocation[aa].count) {
      smallestKey = aa
      smallestCount = allocation[aa].count
    }
  }

  // update assignee
  await db
    .update(conversationModel)
    .set({
      assignedUserId: allocation[smallestKey].assignedUserId,
      assignedInboxTeamId: allocation[smallestKey].assignedInboxTeamId,
    })
    .where(eq(conversationModel.id, conversation.id))

  try {
    await emitConversationAssigned(
      conversation.chatbotId,
      conversation.contactId,
      conversation.id,
      allocation[smallestKey].assignedUserId ||
        allocation[smallestKey].assignedInboxTeamId ||
        "system",
      "system",
    )
  } catch (error) {
    console.error("Failed to emit conversationAssigned event:", error)
  }
}

export async function unassignConversation({
  conversation,
}: ExecuteStepProps<UnassignConversationStepSchema>) {
  await db
    .update(conversationModel)
    .set({
      assignedUserId: null,
      assignedInboxTeamId: null,
    })
    .where(eq(conversationModel.id, conversation.id))

  try {
    await emitConversationUnassigned(
      conversation.chatbotId,
      conversation.contactId,
      conversation.id,
      "system",
    )
  } catch (error) {
    console.error("Failed to emit conversationUnassigned event:", error)
  }
}

export async function followConversation({
  conversation,
}: ExecuteStepProps<FollowConversationStepSchema>) {
  await db
    .update(conversationModel)
    .set({ followed: true })
    .where(eq(conversationModel.id, conversation.id))

  try {
    await emitConversationFollowUp(
      conversation.chatbotId,
      conversation.contactId,
      conversation.id,
      "system",
    )
  } catch (error) {
    console.error("Failed to emit conversationFollowed event:", error)
  }
}

export async function unfollowConversation({
  conversation,
}: ExecuteStepProps<UnfollowConversationStepSchema>) {
  await db
    .update(conversationModel)
    .set({ followed: false })
    .where(eq(conversationModel.id, conversation.id))
}

export async function disableBot({
  conversation,
}: ExecuteStepProps<DisableBotStepSchema>) {
  await db
    .update(conversationModel)
    .set({ liveChatEnabled: true })
    .where(eq(conversationModel.id, conversation.id))

  try {
    await emitConversationTransferredToHuman(
      conversation.chatbotId,
      conversation.contactId,
      conversation.id,
      "bot",
    )
  } catch (error) {
    console.error("Failed to emit conversationTransferredToHuman event:", error)
  }
}

export async function enableBot({
  conversation,
}: ExecuteStepProps<EnableBotStepSchema>) {
  await db
    .update(conversationModel)
    .set({ liveChatEnabled: false })
    .where(eq(conversationModel.id, conversation.id))

  try {
    await emitConversationTransferredToBot(
      conversation.chatbotId,
      conversation.contactId,
      conversation.id,
      "system",
    )
  } catch (error) {
    console.error("Failed to emit conversationTransferredToBot event:", error)
  }
}
