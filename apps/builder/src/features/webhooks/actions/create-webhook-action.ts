"use server"

import { db } from "@aha.chat/database/client"
import { webhookModel } from "@aha.chat/database/schema"
import type { FolderType } from "@aha.chat/database/types"
import { updateWebhookCache } from "@aha.chat/events"
import { createId } from "@paralleldrive/cuid2"
import { getTranslations } from "next-intl/server"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"
import { MAX_WEBHOOKS_PER_CHATBOT } from "../constants"
import {
  type CreateWebhookSchema,
  createWebhookSchema,
} from "../schemas/create-webhook-schema"
import { MaxWebhooksReachedException } from "../schemas/exception"

export const createWebhookAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(createWebhookSchema)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: CreateWebhookSchema
    }) => {
      const t = await getTranslations()

      const existingWebhooks = await db.query.webhookModel.findMany({
        where: { chatbotId },
        columns: { id: true },
      })
      const existingWebhooksCount = existingWebhooks.length

      if (existingWebhooksCount >= MAX_WEBHOOKS_PER_CHATBOT) {
        throw new MaxWebhooksReachedException(
          t("validation.maxItemsReached", {
            max: MAX_WEBHOOKS_PER_CHATBOT,
            feature: "webhooks",
          }),
        )
      }

      if (parsedInput.folderId) {
        await ensureFolderIsExists(
          parsedInput.folderId,
          chatbotId,
          "webhook" as FolderType,
        )
      }

      const { ...webhookData } = parsedInput

      const [result] = await db
        .insert(webhookModel)
        .values({
          id: createId(),
          ...webhookData,
          chatbotId,
          url: "",
        })
        .returning()

      await updateWebhookCache(chatbotId)

      return result
    },
  )
