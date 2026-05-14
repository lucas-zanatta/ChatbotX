"use server"

import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { inboxStatuses } from "@chatbotx.io/database/partials"
import {
  inboxModel,
  integrationInstagramModel,
} from "@chatbotx.io/database/schema"
import {
  type InstagramAuthValue,
  mapToChannelError,
  unsubscribePageFromInstagramWebhook,
} from "@chatbotx.io/integration-instagram"
import { ChannelErrorCategory } from "@chatbotx.io/sdk"
import {
  type WorkspaceIdAndIdRequestParams,
  workspaceIdAndIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"

export const disconnectInstagramAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId, integrationInstagramId],
    }: {
      bindArgsParsedInputs: WorkspaceIdAndIdRequestParams
    }) => {
      const integrationInstagram = await findOrFail({
        table: integrationInstagramModel,
        where: {
          id: integrationInstagramId,
          workspaceId,
        },
        message: "Integration Instagram not found",
      })

      await db.transaction(async (tx) => {
        const authValue = integrationInstagram.auth as InstagramAuthValue
        try {
          await unsubscribePageFromInstagramWebhook({
            pageId: integrationInstagram.pageId,
            accessToken: authValue.tokens.accessToken as string,
            version: authValue.metadata.version,
          })
        } catch (error) {
          const channelError = mapToChannelError(error)
          if (channelError.category !== ChannelErrorCategory.AUTH_FAILED) {
            throw channelError
          }
        }

        await tx
          .delete(integrationInstagramModel)
          .where(eq(integrationInstagramModel.id, integrationInstagram.id))

        await tx
          .update(inboxModel)
          .set({ status: inboxStatuses.enum.disconnected })
          .where(eq(inboxModel.id, integrationInstagram.inboxId))
      })

      revalidateCacheTags([
        `workspaces:${workspaceId}#instagram`,
        `workspaces:${workspaceId}#inboxes`,
      ])
    },
  )
