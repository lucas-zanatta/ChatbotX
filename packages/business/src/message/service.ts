import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import { type MessageType, messageTypes } from "@chatbotx.io/database/partials"
import { createMessageRepository } from "@chatbotx.io/database/repositories"
import type { MessageModel } from "@chatbotx.io/database/types"
import { withCache } from "@chatbotx.io/redis"
import { BaseService } from "../base.service"

const LAST_INPUT_LOOKBACK_MS = 180 * 24 * 60 * 60 * 1000

type FindByProps = {
  id: string
  conversationId: string
  messageType: MessageType
}

class MessageService extends BaseService {
  protected readonly cachePrefix: string = "messages"

  async findByUncached(props: {
    tx?: DatabaseClient
    where: Partial<FindByProps>
  }): Promise<MessageModel | undefined> {
    const { tx = db, where } = props
    return await tx.query.messageModel.findFirst({
      where,
    })
  }

  async findBy(props: {
    tx?: DatabaseClient
    where: Partial<FindByProps>
    ttlInSeconds?: number
  }): Promise<MessageModel | undefined> {
    const cacheKey = `${this.cachePrefix}:${JSON.stringify(props.where)}`

    return await withCache(
      cacheKey,
      async () => await this.findByUncached(props),
      {
        dynamicTags: (result) => {
          if (result) {
            return [`tags:${this.cachePrefix}:${result.id}`]
          }
        },
        ttl: props.ttlInSeconds,
      },
    )
  }

  async findLatestIncomingMessage(
    conversationId: string,
  ): Promise<MessageModel | undefined> {
    const repository = await createMessageRepository()
    const [message] = await repository.findLastByConversation(conversationId, {
      limit: 1,
      messageTypes: [messageTypes.enum.incoming],
      // Sharded message reads require a bounded time range. Six months keeps
      // last_input useful for active conversations without scanning all shards.
      sinceTime: new Date(Date.now() - LAST_INPUT_LOOKBACK_MS),
    })
    return message
  }

  listLastMessages(props: {
    tx?: DatabaseClient
    conversationId: string
    limit: number
  }): Promise<MessageModel[]> {
    const { tx = db, conversationId, limit } = props
    return withCache(
      `messages:${conversationId}:latest:${limit}`,
      async () => {
        const messages = await tx.query.messageModel.findMany({
          where: {
            conversationId,
            messageType: {
              in: [messageTypes.enum.incoming, messageTypes.enum.outgoing],
            },
          },
          limit,
          orderBy: { createdAt: "desc", id: "asc" },
        })
        return messages.reverse()
      },
      {
        tags: [
          `conversations:${conversationId}`,
          `conversations:${conversationId}:messages`,
        ],
      },
    )
  }
}

export const messageService = new MessageService()
