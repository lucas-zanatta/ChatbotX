import { and, count, db, eq, isNull } from "@chatbotx.io/database/client"
import { conditionModel, triggerModel } from "@chatbotx.io/database/schema"
import type { ConditionModel, TriggerModel } from "@chatbotx.io/database/types"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { GetTriggersSchema, ListTriggersResponse } from "../schema/query"

export async function getTriggers(
  input: GetTriggersSchema,
): Promise<ListTriggersResponse> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  // Build SQL conditions
  const conditions = [eq(triggerModel.workspaceId, input.workspaceId)]

  if (input.folderId !== undefined) {
    const folderId =
      input.folderId === null || input.folderId === "" ? null : input.folderId
    if (folderId === null) {
      conditions.push(isNull(triggerModel.folderId))
    } else {
      conditions.push(eq(triggerModel.folderId, folderId))
    }
  }

  if (input.name) {
    conditions.push(eq(triggerModel.name, input.name))
  }

  const whereClause = and(...conditions)

  // Execute queries - fetch triggers with SQL builder, then load conditions
  const [triggers, countResult] = await Promise.all([
    db
      .select()
      .from(triggerModel)
      .where(whereClause)
      .limit(input.perPage)
      .offset((input.page - 1) * input.perPage),
    db.select({ count: count() }).from(triggerModel).where(whereClause),
  ])

  // Load conditions for triggers
  const triggerIds = triggers.map((t) => t.id)
  const conditionsData =
    triggerIds.length > 0
      ? await db.query.conditionModel.findMany({
          where: { triggerId: { in: triggerIds } },
        })
      : []

  // Merge triggers with conditions
  const data = triggers.map((trigger) => ({
    ...trigger,
    conditions: conditionsData.filter((c) => c.triggerId === trigger.id),
  }))

  const total = countResult[0]?.count ?? 0
  const pageCount = Math.ceil(total / input.perPage)

  return { data, pageCount }
}

export async function findTrigger(params: {
  id?: string
  workspaceId?: string
}): Promise<(TriggerModel & { conditions: ConditionModel[] }) | null> {
  const conditions = [
    params.id ? eq(triggerModel.id, params.id) : undefined,
    params.workspaceId
      ? eq(triggerModel.workspaceId, params.workspaceId)
      : undefined,
  ].filter((condition) => condition !== undefined)

  if (conditions.length === 0) {
    return null
  }

  const [trigger] = await db
    .select()
    .from(triggerModel)
    .where(and(...conditions))
    .limit(1)

  if (!trigger) {
    return null
  }

  const triggerConditions = await db
    .select()
    .from(conditionModel)
    .where(eq(conditionModel.triggerId, trigger.id))

  return {
    ...trigger,
    conditions: triggerConditions,
  }
}
