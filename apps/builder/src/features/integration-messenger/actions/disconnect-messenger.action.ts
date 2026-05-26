"use server"

import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { inboxStatuses } from "@chatbotx.io/database/partials"
import {
  coexistSyncRunModel,
  inboxModel,
  integrationMessengerModel,
} from "@chatbotx.io/database/schema"
import {
  isRevokedTokenError,
  type MessengerAuthValue,
} from "@chatbotx.io/integration-messenger"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { integrations } from "@/integration"
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

  const authValue = integrationMessenger.auth as MessengerAuthValue

  try {
    await integrations.messenger.disconnect(authValue)
  } catch (error) {
    if (!isRevokedTokenError(error)) {
      throw error
    }
  }

  await db.transaction(async (tx) => {
    // Purge sync history for this integration so the scheduler stops picking
    // orphaned runs after disconnect.
    await tx
      .delete(coexistSyncRunModel)
      .where(eq(coexistSyncRunModel.integrationId, integrationMessenger.id))

    await tx
      .delete(integrationMessengerModel)
      .where(eq(integrationMessengerModel.id, integrationMessenger.id))

    await tx
      .update(inboxModel)
      .set({ status: inboxStatuses.enum.disconnected })
      .where(eq(inboxModel.id, integrationMessenger.inboxId))
  })
}
