import { logger } from "./logger"
import { TriggerEventEmitter } from "./trigger/emitter"
import { WebhookEventEmitter } from "./webhook/emitter"

const EMITTER_REGISTRY = [TriggerEventEmitter, WebhookEventEmitter] as const

async function emitToAllEmitters(
  eventName: string,
  ...args: unknown[]
): Promise<void> {
  const results = await Promise.allSettled(
    EMITTER_REGISTRY.map((emitter) => {
      const method = (
        emitter as unknown as Record<
          string,
          (...args: unknown[]) => Promise<void>
        >
      )[eventName]
      return method.call(emitter, ...args)
    }),
  )

  for (const result of results) {
    if (result.status === "rejected") {
      logger.error({ err: result.reason }, `Failed to emit event: ${eventName}`)
    }
  }
}

// Contact events
export const emitContactCreated = async (
  workspaceId: string,
  contactId: string,
  name?: string,
  phone?: string,
  email?: string,
  customFields?: Record<string, unknown>,
) =>
  await emitToAllEmitters(
    "contactCreated",
    workspaceId,
    contactId,
    name,
    phone,
    email,
    customFields,
  )

// Tag events
export const emitTagApplied = async (
  workspaceId: string,
  contactId: string,
  tagId: string,
) => await emitToAllEmitters("tagApplied", workspaceId, contactId, tagId)

export const emitTagRemoved = async (
  workspaceId: string,
  contactId: string,
  tagId: string,
) => await emitToAllEmitters("tagRemoved", workspaceId, contactId, tagId)

// Custom field events
export const emitCustomFieldChanged = async (
  workspaceId: string,
  contactId: string,
  customFieldId: string,
  customFieldName: string,
  oldValue: unknown,
  newValue: unknown,
) =>
  await emitToAllEmitters(
    "customFieldChanged",
    workspaceId,
    contactId,
    customFieldId,
    customFieldName,
    oldValue,
    newValue,
  )

// Conversation events
export const emitConversationTransferredToHuman = async (
  workspaceId: string,
  contactId: string,
  conversationId: string,
  transferredBy?: string,
) =>
  await emitToAllEmitters(
    "conversationTransferredToHuman",
    workspaceId,
    contactId,
    conversationId,
    transferredBy,
  )

export const emitConversationTransferredToBot = async (
  workspaceId: string,
  contactId: string,
  conversationId: string,
  transferredBy?: string,
) =>
  await emitToAllEmitters(
    "conversationTransferredToBot",
    workspaceId,
    contactId,
    conversationId,
    transferredBy,
  )

export const emitContactUnsubscribed = async (
  workspaceId: string,
  contactId: string,
) => await emitToAllEmitters("contactUnsubscribed", workspaceId, contactId)

export const emitConversationArchived = async (
  workspaceId: string,
  contactId: string,
  conversationId: string,
  archivedBy?: string,
) =>
  await emitToAllEmitters(
    "conversationArchived",
    workspaceId,
    contactId,
    conversationId,
    archivedBy,
  )

export const emitConversationFollowUp = async (
  workspaceId: string,
  contactId: string,
  conversationId: string,
  markedBy?: string,
) =>
  await emitToAllEmitters(
    "conversationFollowUp",
    workspaceId,
    contactId,
    conversationId,
    markedBy,
  )

export const emitConversationAssigned = async (
  workspaceId: string,
  contactId: string,
  conversationId: string,
  assignedTo: string,
  assignedBy?: string,
) =>
  await emitToAllEmitters(
    "conversationAssigned",
    workspaceId,
    contactId,
    conversationId,
    assignedTo,
    assignedBy,
  )

export const emitConversationUnassigned = async (
  workspaceId: string,
  contactId: string,
  conversationId: string,
  unassignedBy?: string,
) =>
  await emitToAllEmitters(
    "conversationUnassigned",
    workspaceId,
    contactId,
    conversationId,
    unassignedBy,
  )

export const emitInstagramCommentCreated = async (
  workspaceId: string,
  contactId: string,
  comment: {
    commentId: string
    mediaId?: string
    text?: string
    username?: string
    parentId?: string
  },
) =>
  await emitToAllEmitters(
    "instagramCommentCreated",
    workspaceId,
    contactId,
    comment,
  )

export const emitInstagramMessageReceived = async (
  workspaceId: string,
  contactId: string,
  message: {
    messageId?: string
    text?: string
    quickReplyPayload?: string | null
  },
) =>
  await emitToAllEmitters(
    "instagramMessageReceived",
    workspaceId,
    contactId,
    message,
  )

export const emitInstagramPostbackReceived = async (
  workspaceId: string,
  contactId: string,
  postback: {
    payload?: string | null
    title?: string | null
    messageId?: string
  },
) =>
  await emitToAllEmitters(
    "instagramPostbackReceived",
    workspaceId,
    contactId,
    postback,
  )

export const emitInstagramReferralReceived = async (
  workspaceId: string,
  contactId: string,
  referral: { ref?: string | null },
) =>
  await emitToAllEmitters(
    "instagramReferralReceived",
    workspaceId,
    contactId,
    referral,
  )

export const emitInstagramOptinReceived = async (
  workspaceId: string,
  contactId: string,
  optin: { ref?: string | null },
) =>
  await emitToAllEmitters(
    "instagramOptinReceived",
    workspaceId,
    contactId,
    optin,
  )

export const emitInstagramMessageSeen = async (
  workspaceId: string,
  contactId: string,
  seen: { conversationId?: string; seenAt?: Date },
) =>
  await emitToAllEmitters("instagramMessageSeen", workspaceId, contactId, seen)

export const emitInstagramMentionCreated = async (
  workspaceId: string,
  contactId: string,
  mention: { mediaId?: string; commentId?: string; username?: string },
) =>
  await emitToAllEmitters(
    "instagramMentionCreated",
    workspaceId,
    contactId,
    mention,
  )

export const emitInstagramLiveCommentCreated = async (
  workspaceId: string,
  contactId: string,
  comment: { mediaId?: string; commentId?: string; username?: string },
) =>
  await emitToAllEmitters(
    "instagramLiveCommentCreated",
    workspaceId,
    contactId,
    comment,
  )

export const emitInstagramReactionReceived = async (
  workspaceId: string,
  contactId: string,
  reaction: Record<string, unknown>,
) =>
  await emitToAllEmitters(
    "instagramReactionReceived",
    workspaceId,
    contactId,
    reaction,
  )

export const emitInstagramHandoverReceived = async (
  workspaceId: string,
  contactId: string,
  handover: Record<string, unknown>,
) =>
  await emitToAllEmitters(
    "instagramHandoverReceived",
    workspaceId,
    contactId,
    handover,
  )

export const emitInstagramStandbyReceived = async (
  workspaceId: string,
  contactId: string,
  standby: Record<string, unknown>,
) =>
  await emitToAllEmitters(
    "instagramStandbyReceived",
    workspaceId,
    contactId,
    standby,
  )

export const emitInstagramStoryInsights = async (
  workspaceId: string,
  contactId: string,
  insights: Record<string, unknown>,
) =>
  await emitToAllEmitters(
    "instagramStoryInsights",
    workspaceId,
    contactId,
    insights,
  )

// Sequence events
export const emitSequenceSubscribed = async (
  workspaceId: string,
  contactId: string,
  sequenceId: string,
  sequenceName: string,
) =>
  await emitToAllEmitters(
    "sequenceSubscribed",
    workspaceId,
    contactId,
    sequenceId,
    sequenceName,
  )

export const emitSequenceUnsubscribed = async (
  workspaceId: string,
  contactId: string,
  sequenceId: string,
  sequenceName: string,
) =>
  await emitToAllEmitters(
    "sequenceUnsubscribed",
    workspaceId,
    contactId,
    sequenceId,
    sequenceName,
  )
