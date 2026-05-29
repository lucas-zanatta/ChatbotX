"use server"

import { and, db, eq } from "@chatbotx.io/database/client"
import { integrationZaloModel } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"

export const toggleZaloTagSyncAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(z.object({ enabled: z.boolean() }))
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, integrationId],
      parsedInput: { enabled },
    } = props

    await db
      .update(integrationZaloModel)
      .set({ syncTagEnabledAt: enabled ? new Date() : null })
      .where(
        and(
          eq(integrationZaloModel.id, integrationId),
          eq(integrationZaloModel.workspaceId, workspaceId),
        ),
      )

    await revalidateCacheTags(`workspaces:${workspaceId}#zalos`)
  })
