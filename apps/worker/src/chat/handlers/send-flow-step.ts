import {
  botMessageFallbackReasons,
  botMessageResults,
  botMessageRouteTypes,
  contactEventTypes,
  contactTrackingService,
  trackingResponseTypes,
} from "@chatbotx.io/analytics"
import { db, eq } from "@chatbotx.io/database/client"
import {
  channelTypes,
  contentTypes,
  messageTypes,
  senderTypes,
} from "@chatbotx.io/database/partials"
import { createMessageRepository } from "@chatbotx.io/database/repositories"
import {
  contactInboxModel,
  type messageModel,
} from "@chatbotx.io/database/schema"
import type { AttachmentModel } from "@chatbotx.io/database/types"
import { getPublicUrl } from "@chatbotx.io/database/utils"
import { emit } from "@chatbotx.io/event-bus"
import { uploadFileFromUrl } from "@chatbotx.io/filesystem/node-upload"
import type { MetadataPayload } from "@chatbotx.io/flow-config"
import {
  appendCodeToMagicLink,
  type ButtonStepProps,
  buttonTypes,
  encodeButtonPayload,
  extractMetadata,
  messageEventTypeSchema,
  type SendCardStepSchema,
  stepTypes,
} from "@chatbotx.io/flow-config"
import {
  broadcastToGuestParty,
  broadcastToWorkspaceParty,
  RealtimeEventType,
} from "@chatbotx.io/partysocket-config"
import {
  IntegrationException,
  type MessageButtonTemplate,
  type MessageCardTemplate,
  parseSdkError,
  type SendFlowStepData,
} from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import type {
  ChatJobSendChatMessage,
  ChatJobSendFlowStep,
} from "@chatbotx.io/worker-config"
import { trackBotResponse } from "../../integration/handlers/automated-response/track-bot-response"
import { logger } from "../../lib/logger"
import { sendFlowStepToExternal, sendMessageToExternal } from "./send-message"
import { processWhatsappTemplate } from "./send-whatsapp-template"

export const convertButtonsToTemplate = (props: {
  flowId: string
  flowVersionId?: string
  buttons: ButtonStepProps[]
  metadata?: MetadataPayload
  contactInboxId?: string
}): MessageButtonTemplate[] => {
  const { flowId, flowVersionId, buttons, metadata, contactInboxId } = props
  return buttons.map((button) => {
    const buttonPayload = encodeButtonPayload({
      flowId,
      flowVersionId,
      buttonId: button.id,
      broadcastId: extractMetadata("broadcastId", metadata),
      sequenceStepId: extractMetadata("sequenceStepId", metadata),
      contactInboxId,
    })

    if (button.buttonType === buttonTypes.enum.openWebsite) {
      return {
        id: button.id,
        label: button.label,
        buttonType: "url",
        url: appendCodeToMagicLink(button.beforeStep.url, buttonPayload),
      }
    }

    return {
      id: button.id,
      buttonType: "postback",
      label: button.label,
      postback: buttonPayload,
    }
  })
}

const convertCardsToTemplate = (props: {
  flowId: string
  flowVersionId?: string
  cards: SendCardStepSchema[]
  metadata?: MetadataPayload
  contactInboxId?: string
}): MessageCardTemplate[] => {
  const { flowId, flowVersionId, cards, metadata, contactInboxId } = props

  return cards.map((card) => ({
    id: card.id,
    title: card.title,
    subtitle: "subtitle" in card ? card.subtitle : undefined,
    imageUrl: "image" in card ? card.image?.url : undefined,
    buttons:
      "buttons" in card
        ? convertButtonsToTemplate({
            flowId,
            flowVersionId,
            buttons: card.buttons,
            metadata,
            contactInboxId,
          })
        : undefined,
  }))
}

export async function sendFlowStep({
  conversationId,
  flowId,
  flowVersionId,
  step,
  trackingContext,
  metadata,
}: ChatJobSendFlowStep["data"]) {
  const conversation = await db.query.conversationModel.findFirst({
    where: { id: conversationId },
    with: { contact: true },
  })
  if (!conversation) {
    return
  }

  // Temporary use the last contact inbox for the conversation
  const targetContactInbox = await db.query.contactInboxModel.findFirst({
    where: {
      contactId: conversation.contactId,
    },
    orderBy: {
      lastMessageAt: "desc",
    },
  })
  if (!targetContactInbox) {
    return
  }

  if (step.stepType === stepTypes.enum.sendWaTemplateMessage) {
    if (targetContactInbox.channel !== channelTypes.enum.whatsapp) {
      return
    }

    try {
      await processWhatsappTemplate({
        conversation,
        contactInbox: targetContactInbox,
        template: {
          id: step.template.id,
          name: step.template.name,
          language: step.template.language,
          params: step.template.params,
        },
        flow: {
          id: flowId,
          versionId: flowVersionId,
          buttons: step?.buttons ?? [],
        },
        step,
        trackingContext,
        metadata,
      })
    } catch (error) {
      logger.error(
        error,
        `sendFlowStep WhatsApp template error for conversationId: ${conversationId}`,
      )
    }

    return
  }

  const eventLogData = {
    context: {
      workspaceId: conversation.workspaceId,
      contactId: conversation.contactId,
      conversationId: conversation.id,
      channel: targetContactInbox.channel,
      contactInboxId: targetContactInbox.id,
    },
    action: {
      flowId,
      flowVersionId,
    },
    metadata,
    stepId: step.id,
    nodeId: step.nodeId,
  }

  try {
    const repository = await createMessageRepository()

    let contentAttributes: (typeof messageModel.$inferInsert)["contentAttributes"] =
      {
        metadata,
        stepId: step.id,
        nodeId: step.nodeId,
        flowId,
        flowVersionId,
      }

    if ("buttons" in step && step.buttons.length > 0) {
      contentAttributes = {
        type: "template",
        payload: {
          templateType: "button",
          buttons: convertButtonsToTemplate({
            flowId,
            flowVersionId,
            buttons: step.buttons,
            metadata,
            contactInboxId: targetContactInbox.id,
          }),
        },
        ...contentAttributes,
      }
    }
    if ("cards" in step && step.cards.length > 0) {
      contentAttributes = {
        type: "template",
        payload: {
          templateType: "carousel",
          cards: convertCardsToTemplate({
            flowId,
            flowVersionId,
            cards: step.cards,
            metadata,
            contactInboxId: targetContactInbox.id,
          }),
        },
        ...contentAttributes,
      }
    }

    const messageInput = {
      workspaceId: conversation.workspaceId,
      conversationId: conversation.id,
      contactInboxId: targetContactInbox.id,
      messageType: messageTypes.enum.outgoing,
      contentType: contentTypes.enum.text,
      senderType: senderTypes.enum.bot,
      sourceId: null,
      text: step.stepType === stepTypes.enum.sendText ? step.text : null,
      contentAttributes,
      createdAt: new Date(),
    }

    // Upload file if exists
    let attachmentInput:
      | Parameters<typeof repository.createWithAttachments>[1][0]
      | undefined
    if ("url" in step) {
      const uploadedFile = await uploadFileFromUrl(
        step.url,
        `public/space/${conversation.workspaceId}/conversations/${conversation.id}/${createId()}`,
      )
      attachmentInput = {
        ...uploadedFile,
        workspaceId: conversation.workspaceId,
        conversationId: conversation.id,
      }
    }

    const message = attachmentInput
      ? await repository.createWithAttachments(messageInput, [attachmentInput])
      : await repository.create(messageInput)

    // Add url to attachments for response
    if ("attachments" in message && Array.isArray(message.attachments)) {
      ;(message as { attachments: AttachmentModel[] }).attachments =
        message.attachments.map((att) => ({
          ...att,
          url: getPublicUrl(att.originPath),
        }))
    }

    await db
      .update(contactInboxModel)
      .set({ lastMessageAt: message.createdAt })
      .where(eq(contactInboxModel.id, targetContactInbox.id))

    const promises: Promise<unknown>[] = [
      broadcastToWorkspaceParty(conversation.workspaceId, {
        eventType: RealtimeEventType.messageCreated,
        data: message,
      }),
    ]
    if (targetContactInbox.channel === channelTypes.enum.webchat) {
      promises.push(
        broadcastToGuestParty(targetContactInbox.sourceId, {
          eventType: RealtimeEventType.messageCreated,
          data: message,
        }),
      )
    } else {
      promises.push(
        sendFlowStepToExternal({
          conversation,
          contactInbox: targetContactInbox,
          flowId,
          flowVersionId,
          step: step as SendFlowStepData,
          metadata,
          messageId: message?.id,
        }),
      )
    }

    await Promise.all(promises)
    await emit(messageEventTypeSchema.enum["message:sent"], {
      ...eventLogData,
      action: { messageId: "", flowId },
      occurredAt: new Date(),
    })

    // Send contact tracking event
    contactTrackingService
      .trackEvent({
        workspaceId: conversation.workspaceId,
        contactId: targetContactInbox.contactId,
        eventType: contactEventTypes.enum.contact_message_out, // "contact_message_out",
        senderType: "bot",
        occurredAt: new Date(),
        source: targetContactInbox.source,
        sourceId: targetContactInbox.sourceId,
        channel: targetContactInbox.channel,
        metadata: {
          triggerContext: {
            triggerSource: "worker",
            triggerHandler: "sendFlowStep",
            triggerType: "bot_message_out_flow",
          },
        },
      })
      .catch((error) => {
        logger.error(
          error,
          "[sendFlowStep] Failed to track contact_message_out",
        )
      })

    if (trackingContext) {
      await trackBotResponse({
        ...trackingContext,
        hasResponse: true,
        routeType: "flow",
        result: "success",
        metadata: {
          flowId,
        },
        triggerContext: {
          triggerSource: "worker",
          triggerHandler: "sendFlowStep",
          triggerType: trackingContext.triggerType,
        },
      })
    }
  } catch (error) {
    logger.error(
      error,
      `sendFlowStep error for conversationId: ${conversationId}`,
    )

    await emit(messageEventTypeSchema.enum["message:failed"], {
      ...eventLogData,
      action: {
        messageId: "",
        flowId,
      },
      errorData: await parseSdkError(error),
      occurredAt: new Date(),
    })

    if (trackingContext) {
      await trackBotResponse({
        ...trackingContext,
        hasResponse: false,
        routeType: botMessageRouteTypes.enum.flow,
        result: botMessageResults.enum.fallback,
        metadata: {
          flowId,
          fallbackReason:
            botMessageFallbackReasons.enum.handler_error_to_fallback,
        },
        triggerContext: {
          triggerSource: "worker",
          triggerHandler: "sendFlowStep",
          triggerType: `${trackingContext.triggerType}_failed`,
        },
      })
    }
  }
}

export const sendChatMessage = async (
  props: ChatJobSendChatMessage["data"],
) => {
  const {
    conversation,
    contactInbox: targetContactInbox,
    text,
    url,
    trackingContext,
    metadata,
  } = props

  const contactInbox =
    targetContactInbox ??
    (await db.query.contactInboxModel.findFirst({
      where: {
        contactId: conversation.contactId,
      },
      orderBy: {
        lastMessageAt: "desc",
      },
    }))
  if (!contactInbox) {
    throw new IntegrationException(
      `sendChatMessage: contact inbox not found for conversation ${conversation.id}`,
    )
  }

  if (!(text || url)) {
    return
  }

  try {
    const repository = await createMessageRepository()

    const messageInput = {
      contactInboxId: contactInbox.id,
      workspaceId: conversation.workspaceId,
      conversationId: conversation.id,
      messageType: "outgoing" as const,
      contentType: "text" as const,
      senderType: "bot" as const,
      sourceId: null,
      text,
      contentAttributes: {
        metadata,
      },
      createdAt: new Date(),
    }

    // Upload file if exists
    let attachmentInput:
      | Parameters<typeof repository.createWithAttachments>[1][0]
      | undefined
    if (url) {
      const uploadedFile = await uploadFileFromUrl(
        url,
        `public/space/${conversation.workspaceId}/conversations/${conversation.id}/${createId()}`,
      )
      attachmentInput = {
        ...uploadedFile,
        workspaceId: conversation.workspaceId,
        conversationId: conversation.id,
      }
    }

    const message = attachmentInput
      ? await repository.createWithAttachments(messageInput, [attachmentInput])
      : await repository.create(messageInput)

    // Add url to attachments for response
    if ("attachments" in message && Array.isArray(message.attachments)) {
      ;(message as { attachments: AttachmentModel[] }).attachments =
        message.attachments.map((att) => ({
          ...att,
          url: getPublicUrl(att.originPath),
        }))
    }

    await db
      .update(contactInboxModel)
      .set({ lastMessageAt: message.createdAt })
      .where(eq(contactInboxModel.id, contactInbox.id))

    const promises: Promise<unknown>[] = [
      broadcastToWorkspaceParty(conversation.workspaceId, {
        eventType: RealtimeEventType.messageCreated,
        data: message,
      }),
    ]
    if (contactInbox.channel === channelTypes.enum.webchat) {
      promises.push(
        broadcastToGuestParty(contactInbox.sourceId, {
          eventType: RealtimeEventType.messageCreated,
          data: message,
        }),
      )
    } else {
      promises.push(
        sendMessageToExternal({
          conversation,
          contactInbox,
          message,
          metadata,
        }),
      )
    }

    await Promise.all(promises)

    contactTrackingService
      .trackEvent({
        workspaceId: conversation.workspaceId,
        contactId: contactInbox.contactId,
        eventType: "contact_message_out",
        senderType: "bot",
        occurredAt: new Date(),
        source: contactInbox.source,
        sourceId: contactInbox.sourceId,
        channel: contactInbox.channel,
        metadata: {
          triggerContext: {
            triggerSource: "worker",
            triggerHandler: "sendChatMessage",
            triggerType: "bot_message_out_chat",
          },
        },
      })
      .catch((error) => {
        logger.error(
          error,
          "[sendChatMessage] Failed to track contact_message_out",
        )
      })

    if (trackingContext) {
      await trackBotResponse({
        ...trackingContext,
        hasResponse: true,
        routeType:
          trackingContext.responseType ===
          trackingResponseTypes.enum.automated_response
            ? botMessageRouteTypes.enum.flow
            : botMessageRouteTypes.enum.agent,
        result: botMessageResults.enum.success,
        triggerContext: {
          triggerSource: "worker",
          triggerHandler: "sendChatMessage",
          triggerType: trackingContext.triggerType,
        },
      })
    }
  } catch (error) {
    logger.error(
      error,
      `sendChatMessage error for conversationId: ${conversation.id}`,
    )

    if (trackingContext) {
      await trackBotResponse({
        ...trackingContext,
        hasResponse: false,
        routeType:
          trackingContext.responseType ===
          trackingResponseTypes.enum.automated_response
            ? botMessageRouteTypes.enum.flow
            : botMessageRouteTypes.enum.agent,
        result: botMessageResults.enum.fallback,
        metadata: {
          fallbackReason:
            botMessageFallbackReasons.enum.handler_error_to_fallback,
        },
        triggerContext: {
          triggerSource: "worker",
          triggerHandler: "sendChatMessage",
          triggerType: `${trackingContext.triggerType}_failed`,
        },
      })
    }
  }
}
