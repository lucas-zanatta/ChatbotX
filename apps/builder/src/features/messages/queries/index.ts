"use server"

import { db } from "@chatbotx.io/database/client"
import {
  createMessageRepository,
  getSafeSinceTime,
} from "@chatbotx.io/database/repositories"
import { getPublicUrl } from "@chatbotx.io/database/utils"
import { endOfHour } from "date-fns"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import { decodeCursor, encodeCursor } from "@/lib/pagination"
import type {
  FindMessageRequest,
  ListMessagesRequest,
  ListMessagesResponse,
} from "../schema/query"
import type { MessageResource } from "../schema/resource"

export const listMessages = async (
  input: ListMessagesRequest,
): Promise<ListMessagesResponse> => {
  // await assertCurrentUserCanAccessChatbot(workspaceId)

  // Fetch conversation to get contactInbox for shard optimization
  const conversation = input.conversationId
    ? await db.query.conversationModel.findFirst({
        where: { id: input.conversationId },
      })
    : null

  const contactInbox = conversation
    ? await db.query.contactInboxModel.findFirst({
        where: { contactId: conversation.contactId },
        orderBy: { lastMessageAt: "desc" },
      })
    : null

  const repository = await createMessageRepository()
  const cursor = decodeCursor(input.cursor)

  const result = await repository.listByConversation({
    workspaceId: input.workspaceId,
    conversationId: input.conversationId,
    pagination: {
      limit: input.perPage ?? 20,
      cursor: cursor
        ? cursor
        : {
            createdAt: endOfHour(contactInbox?.lastMessageAt ?? new Date()),
            id: "",
          },
    },
  })

  if (result.data.length === 0) {
    return { data: [], nextCursor: null, prevCursor: null }
  }

  const messagesWithUrls = result.data.map((message) => ({
    ...message,
    attachments: message.attachments.map((attachment) => ({
      ...attachment,
      url: getPublicUrl(attachment.originPath),
    })),
  }))

  let nextCursor: string | null = null
  const prevCursor: string | null = null

  if (result.nextCursor) {
    nextCursor = encodeCursor({
      direction: "prev",
      createdAt: result.nextCursor.createdAt,
      id: result.nextCursor.id,
      shardId: result.nextCursor.shardId,
    })
  }

  return { data: messagesWithUrls, nextCursor, prevCursor }
}

export const findMessage = async (
  input: FindMessageRequest,
): Promise<MessageResource> => {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  const repository = await createMessageRepository()
  const message = await repository.findById(
    input.id,
    getSafeSinceTime(input.createdAt),
  )

  if (!message) {
    throw new Error("Message not found")
  }

  return message as MessageResource
}
