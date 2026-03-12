"use server"

import { db } from "@aha.chat/database/client"
import { triggerModel } from "@aha.chat/database/schema"
import { FolderType } from "@aha.chat/database/types"
import { updateTriggerCache } from "@aha.chat/events"
import { createId } from "@paralleldrive/cuid2"
import { getTranslations } from "next-intl/server"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"
import { MAX_TRIGGERS_PER_CHATBOT } from "../constants"
import {
  type CreateTriggerSchema,
  createTriggerSchema,
} from "../schemas/create-trigger-schema"
import { MaxTriggersReachedException } from "../schemas/exception"

export const createTriggerAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(createTriggerSchema)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: CreateTriggerSchema
    }) => {
      const t = await getTranslations()

      const existingTriggers = await db.query.triggerModel.findMany({
        where: { chatbotId },
        columns: { id: true },
      })
      const existingTriggersCount = existingTriggers.length

      if (existingTriggersCount >= MAX_TRIGGERS_PER_CHATBOT) {
        throw new MaxTriggersReachedException(
          t("validation.maxItemsReached", {
            max: MAX_TRIGGERS_PER_CHATBOT,
            feature: "triggers",
          }),
        )
      }

      if (parsedInput.folderId) {
        await ensureFolderIsExists(
          parsedInput.folderId,
          chatbotId,
          FolderType.trigger,
        )
      }

      const { ...triggerData } = parsedInput

      const [result] = await db
        .insert(triggerModel)
        .values({
          id: createId(),
          ...triggerData,
          chatbotId,
        })
        .returning()

      await updateTriggerCache(chatbotId)

      return result
    },
  )
