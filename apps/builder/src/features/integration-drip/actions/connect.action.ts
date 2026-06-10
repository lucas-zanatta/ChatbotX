"use server"

import { integrationDripService } from "@chatbotx.io/business"
import { createDripAuth } from "@chatbotx.io/integration-drip"
import { normalizeError } from "universal-error-normalizer"
import { workspaceIdrequestParams } from "@/features/common/schemas"
import { integrations } from "@/integration"
import { logger } from "@/lib/log"
import { workspaceActionClient } from "@/lib/safe-action"
import { connectDripSchema } from "../schemas"

export const connectDripAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(connectDripSchema)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) => {
    try {
      const auth = createDripAuth(parsedInput.apiToken, parsedInput.accountId)
      await integrations.drip.runAction("validateCredentials", {
        props: { apiToken: auth.apiToken, accountId: auth.accountId },
      })
      await integrationDripService.upsert({ workspaceId, auth })
    } catch (error) {
      logger.error(
        { err: normalizeError(error), workspaceId },
        "Failed to connect Drip",
      )
      throw error
    }
  })
