import { db, ilike } from "@aha.chat/database/client"
import { triggerModel } from "@aha.chat/database/schema"
import type { TriggerModel } from "@aha.chat/database/types"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { TriggerCollection } from "../schemas"
import type { GetTriggersSchema } from "../schemas/get-trigger-schema"

export async function getTriggers(
  input: GetTriggersSchema,
): Promise<TriggerCollection> {
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
    whereConditions.name = ilike(triggerModel.name, `%${input.name}%`)
  }

  // Build orderBy
  const orderBy: Record<string, "asc" | "desc"> = {}
  for (const sortItem of input.sort) {
    if ((sortItem.id as string) !== "contacts") {
      orderBy[sortItem.id as string] = sortItem.desc ? "desc" : "asc"
    }
  }

  const data = await db.query.triggerModel.findMany({
    where: whereConditions,
    orderBy,
    offset: (input.page - 1) * input.perPage,
    limit: input.perPage,
    with: {
      conditions: true,
    },
  })

  const allTriggers = await db.query.triggerModel.findMany({
    where: whereConditions,
    columns: { id: true },
  })
  const total = allTriggers.length

  const pageCount = Math.ceil(total / input.perPage)

  return { data, pageCount }
}

export async function findTrigger(where: {
  id?: string
  chatbotId?: string
}): Promise<TriggerModel | null> {
  const result = await db.query.triggerModel.findFirst({
    where,
    with: {
      conditions: true,
    },
  })
  return result ?? null
}
