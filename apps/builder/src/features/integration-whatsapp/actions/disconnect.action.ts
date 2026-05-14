"use server"

import { buildContext } from "@chatbotx.io/business"
import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { inboxStatuses } from "@chatbotx.io/database/partials"
import {
  inboxModel,
  integrationWhatsappModel,
} from "@chatbotx.io/database/schema"
import type { WhatsappAuthValue } from "@chatbotx.io/integration-whatsapp"
import { WhatsappException } from "@chatbotx.io/integration-whatsapp/exception"
import {
  type WorkspaceIdAndIdRequestParams,
  workspaceIdAndIdRequestParams,
} from "@/features/common/schemas"
import { integrations } from "@/integration"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { authActionClient } from "@/lib/safe-action"

export const disconnectWhatsappAction = authActionClient
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId, id],
    }: {
      bindArgsParsedInputs: WorkspaceIdAndIdRequestParams
    }) => {
      const integrationWhatsapp = await findOrFail({
        table: integrationWhatsappModel,
        where: {
          workspaceId,
          id,
        },
        message: "Integration Whatsapp not found",
      })

      try {
        const ctx = await buildContext({
          workspaceId,
          integrationType: "whatsapp",
          integration: {
            ...integrationWhatsapp,
            auth: integrationWhatsapp.auth as WhatsappAuthValue,
          },
        })
        await integrations.whatsapp.runAction("unsubscribeWebhook", {
          ctx,
        })
      } catch (error) {
        if (error instanceof WhatsappException) {
          const isRevoked = await error.isRevokedTokenError()
          if (!isRevoked) {
            throw error
          }
        }
      }

      await db.transaction(async (tx) => {
        await tx
          .delete(integrationWhatsappModel)
          .where(eq(integrationWhatsappModel.id, integrationWhatsapp.id))

        await tx
          .update(inboxModel)
          .set({ status: inboxStatuses.enum.disconnected })
          .where(eq(inboxModel.id, integrationWhatsapp.inboxId))
      })

      revalidateCacheTags(`workspaces:${workspaceId}#inboxes`)
    },
  )
