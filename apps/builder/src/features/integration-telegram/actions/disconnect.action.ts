"use server"

import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { inboxStatuses } from "@chatbotx.io/database/partials"
import {
  inboxModel,
  integrationTelegramModel,
} from "@chatbotx.io/database/schema"
import {
  mapToChannelError,
  type TelegramAuthValue,
} from "@chatbotx.io/integration-telegram"
import { ChannelErrorCategory } from "@chatbotx.io/sdk"
import {
  type WorkspaceIdAndIdRequestParams,
  workspaceIdAndIdRequestParams,
} from "@/features/common/schemas"
import { integrations } from "@/integration"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"

export const disconnectTelegramAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId, id],
    }: {
      bindArgsParsedInputs: WorkspaceIdAndIdRequestParams
    }) => {
      const integrationTelegram = await findOrFail({
        table: integrationTelegramModel,
        where: { workspaceId, id },
        message: "Integration Telegram not found",
      })

      await db.transaction(async (tx) => {
        await tx
          .delete(integrationTelegramModel)
          .where(eq(integrationTelegramModel.id, integrationTelegram.id))
        await tx
          .update(inboxModel)
          .set({ status: inboxStatuses.enum.disconnected })
          .where(eq(inboxModel.id, integrationTelegram.inboxId))
      })

      try {
        await integrations.telegram.disconnect(
          integrationTelegram.auth as TelegramAuthValue,
        )
      } catch (error) {
        const channelError = mapToChannelError(error)
        if (channelError.category !== ChannelErrorCategory.AUTH_FAILED) {
          throw channelError
        }
      }

      revalidateCacheTags(`workspaces:${workspaceId}#telegrams`)
    },
  )
