import { db } from "@aha.chat/database/client"
import { BaseCache } from "../base-cache"
import type { TriggerEventType } from "./types"

class TriggerCache extends BaseCache {
  protected cachePrefix = "trigger:cache:"
  protected redisTTL = 3600
  protected ramTTL = 5000

  protected async queryActiveItems(chatbotId: string) {
    const items = await db.query.triggerModel.findMany({
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

const triggerCache = new TriggerCache()

export async function hasActiveTriggers(
  chatbotId: string,
  eventTypes: TriggerEventType[],
  sourceId?: string,
): Promise<boolean> {
  return await triggerCache.hasActive(chatbotId, eventTypes, sourceId)
}

export async function updateTriggerCache(chatbotId: string): Promise<void> {
  return await triggerCache.updateCache(chatbotId)
}

export async function getCacheData(
  chatbotId: string,
): Promise<Record<number, string[]>> {
  return await triggerCache.getCacheData(chatbotId)
}

export async function removeTriggerCache(chatbotId: string): Promise<void> {
  return await triggerCache.removeCache(chatbotId)
}

setInterval(() => triggerCache.cleanupExpiredCache(), 30_000)
