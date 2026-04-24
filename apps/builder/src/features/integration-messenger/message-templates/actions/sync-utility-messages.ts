"use server"

import { db, eq, findOrFail, inArray } from "@chatbotx.io/database/client"
import {
  integrationMessengerModel,
  messengerMessageTemplateModel,
} from "@chatbotx.io/database/schema"
import { getStoragePrefix, uploader } from "@chatbotx.io/filesystem"
import type { MessengerAuthValue } from "@chatbotx.io/integration-messenger"
import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { integrations } from "@/integration"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"

export const syncUtilityMessagesAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
    } = props

    const integrationMessenger = await findOrFail({
      table: integrationMessengerModel,
      where: { workspaceId, id },
      message: "Messenger integration not found",
    })

    const ctx = {
      auth: integrationMessenger.auth as MessengerAuthValue,
      uploader,
      storagePrefix: getStoragePrefix(
        workspaceId,
        integrationMessenger.inboxId,
      ),
    }

    const res = await integrations.messenger.runAction("listMessageTemplates", {
      ctx,
    })

    await db.transaction(async (tx) => {
      const existingTemplates = await tx
        .select({
          id: messengerMessageTemplateModel.id,
          sourceId: messengerMessageTemplateModel.sourceId,
        })
        .from(messengerMessageTemplateModel)
        .where(
          eq(
            messengerMessageTemplateModel.integrationMessengerId,
            integrationMessenger.id,
          ),
        )

      const incomingSourceIds = new Set(res.data.map((t) => t.id))

      const templatesToDelete = existingTemplates.filter(
        (t) => !incomingSourceIds.has(t.sourceId),
      )

      if (templatesToDelete.length > 0) {
        await tx.delete(messengerMessageTemplateModel).where(
          inArray(
            messengerMessageTemplateModel.id,
            templatesToDelete.map((t) => t.id),
          ),
        )
      }

      for (const template of res.data) {
        const existing = existingTemplates.find(
          (t) => t.sourceId === template.id,
        )

        if (existing) {
          await tx
            .update(messengerMessageTemplateModel)
            .set({
              name: template.name,
              language: template.language,
              category: template.category,
              status: template.status,
              components: template.components,
            })
            .where(eq(messengerMessageTemplateModel.id, existing.id))
        } else {
          await tx.insert(messengerMessageTemplateModel).values([
            {
              id: createId(),
              name: template.name,
              integrationMessengerId: integrationMessenger.id,
              language: template.language,
              category: template.category,
              status: template.status,
              sourceId: template.id,
              components: template.components,
            },
          ])
        }
      }
    })

    revalidateCacheTags(`workspaces:${workspaceId}#messenger#utilityMessages`)
  })
