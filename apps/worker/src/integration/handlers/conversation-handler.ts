import { conversationTrackingService } from "@aha.chat/analytics"
import { type Prisma, prisma } from "@aha.chat/database"
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
import type { FlowStepProps } from "./step-handler"

export async function archiveConversation({
  conversation,
}: FlowStepProps<ArchiveConversationStepSchema>) {
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { archivedAt: new Date() },
  })
}

export async function unarchiveConversation({
  conversation,
}: FlowStepProps<UnarchiveConversationStepSchema>) {
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { archivedAt: null },
  })
}

export async function assignConversation({
  conversation,
  step,
}: FlowStepProps<AssignConversationStepSchema>) {
  const inbox = await prisma.inbox.findFirst({
    where: { id: conversation.inboxId },
    select: { inboxType: true },
  })

  if (step.assignedId.startsWith("u_")) {
    const userId = step.assignedId.substring(2)
    const chatbotMember = await prisma.chatbotMember.findFirst({
      where: {
        userId,
        chatbotId: conversation.chatbotId,
      },
    })
    if (chatbotMember) {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { assignedUserId: userId },
      })

      await conversationTrackingService.trackEvent({
        chatbotId: conversation.chatbotId,
        conversationId: conversation.id,
        eventType: "conversation_assigned",
        toAssignee: userId,
        occurredAt: new Date(),
        channel: inbox?.inboxType,
      })
    }
  } else if (step.assignedId.startsWith("t_")) {
    const inboxTeamId = step.assignedId.substring(2)
    const inboxTeam = await prisma.inboxTeam.findFirst({
      where: {
        id: inboxTeamId,
        chatbotId: conversation.chatbotId,
      },
    })
    if (inboxTeam) {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { assignedInboxTeamId: inboxTeamId },
      })

      await conversationTrackingService.trackEvent({
        chatbotId: conversation.chatbotId,
        conversationId: conversation.id,
        eventType: "conversation_assigned",
        toAssignee: inboxTeamId,
        occurredAt: new Date(),
        channel: inbox?.inboxType,
      })
    }
  }
}

export async function autoAssignConversation({
  conversation,
  step,
}: FlowStepProps<AutoAssignConversationStepSchema>) {
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

  const filterConversationConditions: Prisma.ConversationWhereInput = {}
  switch (step.rule) {
    case AutoAssignConversationRule.LAST_HOUR: {
      filterConversationConditions.createdAt = {
        gte: subHours(new Date(), 1),
      }
      break
    }
    case AutoAssignConversationRule.LAST_8HOURS: {
      filterConversationConditions.createdAt = {
        gte: subHours(new Date(), 8),
      }
      break
    }
    case AutoAssignConversationRule.LAST_24HOURS: {
      filterConversationConditions.createdAt = {
        gte: subHours(new Date(), 24),
      }
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
    requiredUsers = await prisma.chatbotMember.findMany({
      where: {
        chatbotId: conversation.chatbotId,
        id: {
          in: userIds,
        },
      },
      select: {
        userId: true,
      },
    })
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
    requiredInboxTeams = await prisma.inboxTeam.findMany({
      where: {
        chatbotId: conversation.chatbotId,
        id: {
          in: inboxTeamIds,
        },
      },
      select: {
        id: true,
      },
    })
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
  const conversationCount = await prisma.conversation.groupBy({
    by: ["assignedUserId", "assignedInboxTeamId"],
    where: {
      OR: [
        {
          assignedUserId: {
            in: requiredUsers.map((r) => r.userId),
          },
        },
        {
          assignedInboxTeamId: {
            in: requiredInboxTeams.map((r) => r.id),
          },
        },
      ],
      ...filterConversationConditions,
    },
    _count: {
      id: true,
    },
  })
  for (const cc of conversationCount) {
    if (cc.assignedUserId && allocation[`u_${cc.assignedUserId}`]) {
      allocation[`u_${cc.assignedUserId}`].count = cc._count.id
    }

    if (cc.assignedInboxTeamId && allocation[`t_${cc.assignedInboxTeamId}`]) {
      allocation[`t_${cc.assignedInboxTeamId}`].count = cc._count.id
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
  await prisma.conversation.update({
    where: {
      id: conversation.id,
    },
    data: {
      assignedUserId: allocation[smallestKey].assignedUserId,
      assignedInboxTeamId: allocation[smallestKey].assignedInboxTeamId,
    },
  })

  const inbox = await prisma.inbox.findFirst({
    where: { id: conversation.inboxId },
    select: { inboxType: true },
  })

  await conversationTrackingService.trackEvent({
    chatbotId: conversation.chatbotId,
    conversationId: conversation.id,
    eventType: "conversation_assigned",
    toAssignee:
      allocation[smallestKey].assignedUserId ||
      allocation[smallestKey].assignedInboxTeamId ||
      "",
    occurredAt: new Date(),
    channel: inbox?.inboxType,
  })
}

export async function unassignConversation({
  conversation,
}: FlowStepProps<UnassignConversationStepSchema>) {
  const inbox = await prisma.inbox.findFirst({
    where: { id: conversation.inboxId },
    select: { inboxType: true },
  })

  const fromAssignee =
    conversation.assignedUserId || conversation.assignedInboxTeamId

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      assignedUserId: null,
      assignedInboxTeamId: null,
    },
  })

  if (fromAssignee) {
    await conversationTrackingService.trackEvent({
      chatbotId: conversation.chatbotId,
      conversationId: conversation.id,
      eventType: "conversation_unassigned",
      fromAssignee,
      occurredAt: new Date(),
      channel: inbox?.inboxType,
    })
  }
}

export async function followConversation({
  conversation,
}: FlowStepProps<FollowConversationStepSchema>) {
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { followed: true },
  })
}

export async function unfollowConversation({
  conversation,
}: FlowStepProps<UnfollowConversationStepSchema>) {
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { followed: false },
  })
}

export async function disableBot({
  conversation,
}: FlowStepProps<DisableBotStepSchema>) {
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { liveChatEnabled: true },
  })
}

export async function enableBot({
  conversation,
}: FlowStepProps<EnableBotStepSchema>) {
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { liveChatEnabled: false },
  })
}
