"use server"

import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { channelTypes } from "@chatbotx.io/database/partials"
import { createMessageRepository } from "@chatbotx.io/database/repositories"
import {
  contactInboxModel,
  conversationModel,
} from "@chatbotx.io/database/schema"
import type {
  ContactInboxModel,
  ConversationModel,
  UserModel,
} from "@chatbotx.io/database/types"
import { getPublicUrl } from "@chatbotx.io/database/utils"
import { type UploadedFile, uploadMultipleFiles } from "@chatbotx.io/filesystem"
import {
  broadcastToGuestParty,
  broadcastToWorkspaceParty,
  RealtimeEventType,
} from "@chatbotx.io/partysocket-config"
import { zodBigintAsString } from "@chatbotx.io/utils"
import {
  ChatJobAction,
  chatQueue,
  IntegrationJobAction,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { ChatbotXException } from "@/lib/errors/exception"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type CreateMessageRequest,
  createMessageRequest,
} from "../schema/mutation"

export const createMessageAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(createMessageRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, conversationId],
      parsedInput,
      ctx,
    } = props

    const conversation = await findOrFail({
      table: conversationModel,
      where: {
        id: conversationId,
        workspaceId,
      },
      message: "Conversation not found",
    })

    // Find target contact inbox, or fallback to latest interactive contactInbox
    const contactInbox = await db.query.contactInboxModel.findFirst({
      where: {
        contactId: conversation.contactId,
        inboxId: parsedInput.inboxId ? parsedInput.inboxId : undefined,
      },
      orderBy: {
        lastMessageAt: "desc",
      },
    })
    if (!contactInbox) {
      throw new ChatbotXException("Inbox not found")
    }

    return createMessage({
      conversation,
      contactInbox,
      parsedInput,
      user: ctx.user,
    })
  })

export const createMessage = async (props: {
  conversation: ConversationModel
  contactInbox: ContactInboxModel
  parsedInput: CreateMessageRequest
  user?: UserModel
}) => {
  const { conversation, parsedInput, user, contactInbox } = props

  // Handle send flow
  if ("flowId" in parsedInput) {
    await integrationQueue.add(IntegrationJobAction.sendFlow, {
      type: IntegrationJobAction.sendFlow,
      data: {
        conversationId: conversation,
        contactInboxId: contactInbox,
        flowId: parsedInput.flowId,
        nodeId: parsedInput.nodeId,
      },
    })
    return null
  }

  // Upload file if exists
  let uploadedFiles: UploadedFile[] = []
  if ("files" in parsedInput && parsedInput.files.length > 0) {
    uploadedFiles = await uploadMultipleFiles(
      parsedInput.files,
      `public/space/${conversation.workspaceId}/conversations/${conversation.id}`,
    )
  }
  // else if ("fileUrl" in parsedInput) {
  //   const uploadedFile = await uploadFileFromUrl(
  //     parsedInput.fileUrl,
  //     `public/space/${conversation.workspaceId}/conversations/${conversation.id}`,
  //   )
  //   uploadedFiles = [uploadedFile]
  // }

  const repository = await createMessageRepository()

  const messageInput = {
    text: "text" in parsedInput ? parsedInput.text : null,
    messageType: "outgoing" as const,
    workspaceId: conversation.workspaceId,
    conversationId: conversation.id,
    senderType: user ? ("user" as const) : ("api" as const),
    senderId: user?.id ?? null,
    contactInboxId: contactInbox.id,
    contentType: "text" as const,
    createdAt: new Date(),
  }

  const attachmentInputs = uploadedFiles.map((file) => ({
    workspaceId: conversation.workspaceId,
    conversationId: conversation.id,
    ...file,
  }))

  const message =
    attachmentInputs.length > 0
      ? await repository.createWithAttachments(messageInput, attachmentInputs)
      : await repository.create(messageInput)

  // Update conversation metadata in main DB
  await db
    .update(conversationModel)
    .set({
      agentLastReadAt: new Date(),
      lastActivityAt: new Date(),
      adminRepliedAt: new Date(),
    })
    .where(eq(conversationModel.id, conversation.id))

  await db
    .update(contactInboxModel)
    .set({ lastMessageAt: message.createdAt })
    .where(eq(contactInboxModel.id, contactInbox.id))

  const attachments =
    "attachments" in message && Array.isArray(message.attachments)
      ? message.attachments
      : []
  const messageWithAttachments = {
    ...message,
    attachments: attachments.map((attachment) => ({
      ...attachment,
      url: getPublicUrl(attachment.originPath),
    })),
  }

  const promises: Promise<unknown>[] = [
    broadcastToWorkspaceParty(messageWithAttachments.workspaceId, {
      eventType: RealtimeEventType.messageCreated,
      data: {
        ...messageWithAttachments,
        clientId: parsedInput.clientId,
      },
    }),
  ]

  if (contactInbox.channel === channelTypes.enum.webchat) {
    promises.push(
      broadcastToGuestParty(contactInbox.sourceId, {
        eventType: RealtimeEventType.messageCreated,
        data: {
          ...messageWithAttachments,
          clientId: parsedInput.clientId,
        },
      }),
    )
  } else {
    promises.push(
      chatQueue.add(ChatJobAction.sendExternalMessage, {
        type: ChatJobAction.sendExternalMessage,
        data: {
          conversation,
          contactInbox,
          message: {
            ...messageWithAttachments,
            clientId: parsedInput.clientId,
          },
        },
      }),
    )
  }

  // Broadcast and send
  await Promise.all(promises)

  revalidateCacheTags(`workspaces:${conversation.workspaceId}:conversations`)

  return messageWithAttachments
}
