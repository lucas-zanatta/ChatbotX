import { invalidateCacheByTags } from "@chatbotx.io/redis"

export const revalidateCacheTags = (...tags: string[]): Promise<void> =>
  invalidateCacheByTags(tags)
