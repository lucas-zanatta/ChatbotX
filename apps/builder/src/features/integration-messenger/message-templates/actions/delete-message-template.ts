"use server"

import { and, db, eq } from "@chatbotx.io/database/client"
import { messengerMessageTemplateModel } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"

export const deleteMessengerMessageTemplateAction = workspaceActionClient
  .bindArgsSchemas([
    zodBigintAsString(),
    zodBigintAsString(),
    zodBigintAsString(),
  ])
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, integrationMessengerId, templateId],
    } = props

    // Verify the integration belongs to the workspace
    const integration = await db.query.integrationMessengerModel.findFirst({
      where: {
        id: integrationMessengerId,
        workspaceId,
      },
      columns: { id: true },
    })

    if (!integration) {
      throw new Error("Messenger integration not found")
    }

    await db
      .delete(messengerMessageTemplateModel)
      .where(
        and(
          eq(messengerMessageTemplateModel.id, templateId),
          eq(
            messengerMessageTemplateModel.integrationMessengerId,
            integrationMessengerId,
          ),
        ),
      )

    revalidateCacheTags(`workspaces:${workspaceId}#messenger#messageTemplates`)
  })
