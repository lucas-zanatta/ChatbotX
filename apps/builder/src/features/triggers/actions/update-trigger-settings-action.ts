"use server"

import { db, eq, findOrFail } from "@aha.chat/database/client"
import { triggerModel } from "@aha.chat/database/schema"
import type { TriggerModel } from "@aha.chat/database/types"
import { z } from "zod"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"

const updateTriggerSettingsSchema = z.object({
  name: z.optional(z.string().trim().min(1).max(255)),
  active: z.optional(z.boolean()),
})

type UpdateTriggerSettingsSchema = z.infer<typeof updateTriggerSettingsSchema>

export const updateTriggerSettingsAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .inputSchema(updateTriggerSettingsSchema)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId, id],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
      parsedInput: UpdateTriggerSettingsSchema
    }) => {
      const trigger = await findOrFail<TriggerModel>(
        triggerModel,
        { id, chatbotId },
        "Trigger not found",
      )

      await db
        .update(triggerModel)
        .set(parsedInput)
        .where(eq(triggerModel.id, trigger.id))

      revalidateCacheTags(`chatbots:${trigger.chatbotId}#triggers`)
    },
  )
