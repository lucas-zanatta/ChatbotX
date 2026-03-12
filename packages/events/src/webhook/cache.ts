import { db } from "@aha.chat/database/client"
import { BaseCache } from "../base-cache"

class WebhookCache extends BaseCache {
  protected cachePrefix = "webhook:active:"
  protected redisTTL = 3600
  protected ramTTL = 60_000

  protected async queryActiveItems(chatbotId: string) {
    const items = await db.query.webhookModel.findMany({
      where: { chatbotId, active: true },
      with: {
        conditions: true,
      },
    })
    return items.map((item) => ({
      conditions: item.conditions.map((c) => ({
        type: c.eventType,
        sourceId: c.eventSourceId,
      })),
    }))
  }
}

const webhookCache = new WebhookCache()

export async function hasActiveWebhooks(
  chatbotId: string,
  eventTypes: number[],
  sourceId?: string,
): Promise<boolean> {
  return await webhookCache.hasActive(chatbotId, eventTypes, sourceId)
}

export async function updateWebhookCache(chatbotId: string): Promise<void> {
  return await webhookCache.updateCache(chatbotId)
}

export async function removeWebhookCache(chatbotId: string): Promise<void> {
  return await webhookCache.removeCache(chatbotId)
}
