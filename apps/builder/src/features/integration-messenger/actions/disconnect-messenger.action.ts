"use server"

import { buildContext } from "@chatbotx.io/business"
import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { inboxStatuses } from "@chatbotx.io/database/partials"
import {
  inboxModel,
  integrationMessengerModel,
} from "@chatbotx.io/database/schema"
import type { MessengerAuthValue } from "@chatbotx.io/integration-messenger"
import { MessengerAPIException } from "@chatbotx.io/integration-messenger/exception"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { integrations } from "@/integration"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"

export const disconnectMessengerAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
    } = props

    await disconnectMessenger({ workspaceId, id })
  })

const disconnectMessenger = async (ctx: {
  workspaceId: string
  id: string
}) => {
  const integrationMessenger = await findOrFail({
    table: integrationMessengerModel,
    where: {
      id: ctx.id,
      workspaceId: ctx.workspaceId,
    },
    message: "Integration Messenger not found",
  })

  await db.transaction(async (tx) => {
    // Unsubscribe from app
    const authValue = integrationMessenger.auth as MessengerAuthValue

    try {
      const botContext = await buildContext({
        workspaceId: ctx.workspaceId,
        integrationType: "messenger",
        integration: {
          ...integrationMessenger,
          auth: authValue,
        },
      })
      await integrations.messenger.runAction("unsubscribePageFromAppWebhook", {
        ctx: botContext,
      })
    } catch (error) {
      if (error instanceof MessengerAPIException) {
        const isRevoked = await error.isRevokedTokenError()
        if (!isRevoked) {
          throw error
        }
      }
    }

    await tx
      .delete(integrationMessengerModel)
      .where(eq(integrationMessengerModel.id, integrationMessenger.id))

    await tx
      .update(inboxModel)
      .set({ status: inboxStatuses.enum.disconnected })
      .where(eq(inboxModel.id, integrationMessenger.inboxId))
  })

  revalidateCacheTags([
    `workspaces:${ctx.workspaceId}#messenger`,
    `workspaces:${ctx.workspaceId}#inboxes`,
  ])
}
