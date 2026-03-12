import { db, ilike } from "@aha.chat/database/client"
import { webhookModel } from "@aha.chat/database/schema"
import type { WebhookModel } from "@aha.chat/database/types"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { WebhookCollection } from "../schemas"
import type { GetWebhooksSchema } from "../schemas/get-webhook-schema"

export async function getWebhooks(
  input: GetWebhooksSchema,
): Promise<WebhookCollection> {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  // Build where conditions
  const whereConditions: Record<string, unknown> = {
    chatbotId: input.chatbotId,
  }

  if (input.folderId !== undefined) {
    whereConditions.folderId =
      input.folderId === null || input.folderId === "0" ? null : input.folderId
  }

  if (input.name) {
    whereConditions.name = ilike(webhookModel.name, `%${input.name}%`)
  }

  // Build orderBy
  const orderBy: Record<string, "asc" | "desc"> = {}
  for (const sortItem of input.sort) {
    if ((sortItem.id as string) !== "contacts") {
      orderBy[sortItem.id as string] = sortItem.desc ? "desc" : "asc"
    }
  }

  const data = await db.query.webhookModel.findMany({
    where: whereConditions,
    orderBy,
    offset: (input.page - 1) * input.perPage,
    limit: input.perPage,
    with: {
      conditions: true,
    },
  })

  const allWebhooks = await db.query.webhookModel.findMany({
    where: whereConditions,
    columns: { id: true },
  })
  const total = allWebhooks.length

  const pageCount = Math.ceil(total / input.perPage)

  return { data, pageCount }
}

export async function findWebhook(where: {
  id?: string
  chatbotId?: string
}): Promise<WebhookModel | null> {
  const result = await db.query.webhookModel.findFirst({
    where,
    with: {
      conditions: true,
    },
  })
  return result ?? null
}
