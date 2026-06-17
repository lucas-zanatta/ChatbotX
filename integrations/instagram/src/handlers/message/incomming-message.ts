import {
  type Context,
  contentTypes,
  type IncomingAttachment,
  type IncomingContact,
  type IncomingMessage,
  messageTypes,
  type ReceivedMessageResult,
} from "@chatbotx.io/sdk"

import { getMessageAttachmentEntity } from "../../apis/page"
import { InstagramException } from "../../exception"
import { logger } from "../../lib/logger"
import {
  type InstagramAuthValue,
  type InstagramCommentChange,
  type InstagramMessage,
  type InstagramMessagingEvent,
  instagramWebhookEventSchema,
} from "../../schemas"

const getMessageAttachments = async (
  ctx: Context<InstagramAuthValue>,
  message: InstagramMessage,
): Promise<IncomingAttachment[]> => {
  if (!message.attachments) {
    return []
  }

  try {
    const attachmentPromises = message.attachments
      .filter((attachment) => attachment.payload.url)
      .map((attachment) =>
        getMessageAttachmentEntity({ ctx, attachment }).catch((error) => {
          logger.error("Error processing attachment", error)
          return null
        }),
      )

    const attachmentResults = await Promise.allSettled(attachmentPromises)
    return attachmentResults
      .filter(
        (result): result is PromiseFulfilledResult<IncomingAttachment> =>
          result.status === "fulfilled" && result.value !== null,
      )
      .map((result) => result.value)
  } catch (error) {
    logger.error(error, "Error getting message attachments")
    return []
  }
}

export const receiveMessage = async ({
  ctx,
  data,
}: {
  ctx: Context<InstagramAuthValue>
  data: {
    integrationType: string
    integrationIdentifier: string
    payload: unknown
  }
}): Promise<ReceivedMessageResult> => {
  const validatedData = instagramWebhookEventSchema.parse(data.payload)

  const entry = validatedData.entry[0]

  const commentChange = entry.changes?.find(
    (change): change is InstagramCommentChange => change.field === "comments",
  )
  if (commentChange) {
    return getCommentMessageEntity(commentChange)
  }

  const messaging = entry.messaging?.[0]
  if (!messaging) {
    throw new InstagramException("No messaging found")
  }

  if (!(messaging.message || messaging.postback)) {
    throw new InstagramException("No message found")
  }

  return await getMessageEntity(ctx, messaging)
}

const getMessageEntity = async (
  ctx: Context<InstagramAuthValue>,
  messaging: InstagramMessagingEvent,
): Promise<ReceivedMessageResult> => {
  let message: IncomingMessage | null = null
  let postbackAction: string | null = null
  let quickReplyAction: string | null = null
  let ref: string | null = null

  const contactSourceId =
    messaging.sender.id === ctx.auth.metadata.igId
      ? messaging.recipient.id
      : messaging.sender.id
  const contact: IncomingContact = {
    sourceId: contactSourceId,
  }

  if (messaging.message) {
    message = {
      sourceId: messaging.message.mid,
      messageType:
        messaging.sender.id === ctx.auth.metadata.igId
          ? messageTypes.enum.outgoing
          : messageTypes.enum.incoming,
      text: messaging.message.text,
      contentType: contentTypes.enum.text,
      attachments: await getMessageAttachments(ctx, messaging.message),
    }
    quickReplyAction = messaging.message.quick_reply?.payload ?? null
  }

  if (messaging.postback) {
    message = {
      sourceId: messaging.postback.mid,
      messageType: messageTypes.enum.incoming,
      text: messaging.postback.title,
      contentType: contentTypes.enum.text,
    }
    postbackAction = messaging.postback.payload
  }

  if (messaging.referral) {
    ref = messaging.referral.ref
  }

  return { message, postbackAction, quickReplyAction, ref, contact }
}

const getCommentMessageEntity = (
  change: InstagramCommentChange,
): ReceivedMessageResult => {
  const { value } = change
  const sourceId = value.from?.id ?? value.from?.username
  if (!sourceId) {
    throw new InstagramException("No comment author found")
  }

  const text = value.text ?? ""
  return {
    message: {
      sourceId: value.id,
      messageType: messageTypes.enum.incoming,
      text,
      contentType: contentTypes.enum.text,
      contentAttributes: {
        type: "instagram_comment",
        commentId: value.id,
        mediaId: value.media?.id,
        parentId: value.parent_id,
        username: value.from?.username,
      },
    },
    postbackAction: null,
    quickReplyAction: null,
    ref: null,
    contact: {
      sourceId,
      firstName: value.from?.username,
      sourceConversationId: value.media?.id,
    },
  }
}
