import {
  type TriggerEventType,
  triggerEventTypes,
} from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"

// Simple conditions without additional fields
const createSimpleCondition = (type: TriggerEventType) =>
  z.object({
    id: zodBigintAsString().optional(),
    type: z.literal(type),
  })

// Simple conditions
export const conversationTransferredToHuman = createSimpleCondition(
  triggerEventTypes.enum.conversationTransferredToHuman,
)
export const conversationTransferredToBot = createSimpleCondition(
  triggerEventTypes.enum.conversationTransferredToBot,
)
export const newContact = createSimpleCondition(
  triggerEventTypes.enum.newContact,
)
export const contactUnsubscribedFormBroadcast = createSimpleCondition(
  triggerEventTypes.enum.contactUnsubscribedFormBroadcast,
)
export const archived = createSimpleCondition(triggerEventTypes.enum.archived)
export const followUp = createSimpleCondition(triggerEventTypes.enum.followUp)
export const conversationAssigned = createSimpleCondition(
  triggerEventTypes.enum.conversationAssigned,
)
export const conversationUnassigned = createSimpleCondition(
  triggerEventTypes.enum.conversationUnassigned,
)
export const contactReferredANewContact = createSimpleCondition(
  triggerEventTypes.enum.contactReferredANewContact,
)
export const contactReferredExistingContact = createSimpleCondition(
  triggerEventTypes.enum.contactReferredExistingContact,
)

export const instagramCommentCreated = z.object({
  id: zodBigintAsString().optional(),
  type: z.literal(triggerEventTypes.enum.instagramCommentCreated),
  sourceId: z.string().optional(),
  operator: z.literal("contains").optional(),
  value: z
    .object({
      text: z.string().optional(),
    })
    .optional(),
})

export const instagramMessageReceived = z.object({
  id: zodBigintAsString().optional(),
  type: z.literal(triggerEventTypes.enum.instagramMessageReceived),
  operator: z.literal("contains").optional(),
  value: z
    .object({
      text: z.string().optional(),
    })
    .optional(),
})

export const instagramPostbackReceived = createSimpleCondition(
  triggerEventTypes.enum.instagramPostbackReceived,
)
export const instagramReferralReceived = createSimpleCondition(
  triggerEventTypes.enum.instagramReferralReceived,
)
export const instagramOptinReceived = createSimpleCondition(
  triggerEventTypes.enum.instagramOptinReceived,
)
export const instagramMessageSeen = createSimpleCondition(
  triggerEventTypes.enum.instagramMessageSeen,
)
export const instagramMentionCreated = createSimpleCondition(
  triggerEventTypes.enum.instagramMentionCreated,
)
export const instagramLiveCommentCreated = createSimpleCondition(
  triggerEventTypes.enum.instagramLiveCommentCreated,
)
export const instagramReactionReceived = createSimpleCondition(
  triggerEventTypes.enum.instagramReactionReceived,
)
export const instagramHandoverReceived = createSimpleCondition(
  triggerEventTypes.enum.instagramHandoverReceived,
)
export const instagramStandbyReceived = createSimpleCondition(
  triggerEventTypes.enum.instagramStandbyReceived,
)
export const instagramStoryInsights = createSimpleCondition(
  triggerEventTypes.enum.instagramStoryInsights,
)

// Conditions with sourceId
const createConditionWithSourceId = (type: TriggerEventType) =>
  z.object({
    id: zodBigintAsString().optional(),
    type: z.literal(type),
    sourceId: z.string().min(1, "Required"),
  })

export const subscribedToSequence = createConditionWithSourceId(
  triggerEventTypes.enum.subscribedToSequence,
)
export const unsubscribedFromSequence = createConditionWithSourceId(
  triggerEventTypes.enum.unsubscribedFromSequence,
)

// Default functions
export const createDefaultFn =
  <T extends TriggerEventType>(type: T) =>
  () => ({ type })

export const createDefaultFnWithSourceId =
  <T extends TriggerEventType>(type: T) =>
  () => ({ type, sourceId: "" })

export const addInstagramCommentCreatedCondition = () => ({
  type: triggerEventTypes.enum.instagramCommentCreated,
  sourceId: "",
  operator: "contains",
  value: { text: "" },
})

export const addInstagramMessageReceivedCondition = () => ({
  type: triggerEventTypes.enum.instagramMessageReceived,
  operator: "contains",
  value: { text: "" },
})
