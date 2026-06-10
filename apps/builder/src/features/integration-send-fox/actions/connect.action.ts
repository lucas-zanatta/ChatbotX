"use server"

import { integrationSendFoxService } from "@chatbotx.io/business"
import { createSendFoxAuth } from "@chatbotx.io/integration-send-fox"
import { normalizeError } from "universal-error-normalizer"
import { workspaceIdrequestParams } from "@/features/common/schemas"
import { integrations } from "@/integration"
import { logger } from "@/lib/log"
import { workspaceActionClient } from "@/lib/safe-action"
import { connectSendFoxSchema } from "../schemas"

export const connectSendFoxAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(connectSendFoxSchema)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) => {
    try {
      const auth = createSendFoxAuth(parsedInput.accessToken)
      await integrations.sendFox.runAction("validateCredentials", {
        props: { accessToken: auth.accessToken },
      })
      await integrationSendFoxService.upsert({ workspaceId, auth })
    } catch (error) {
      logger.error(
        { err: normalizeError(error), workspaceId },
        "Failed to connect SendFox",
      )
      throw error
    }
  })
