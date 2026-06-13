"use server"

import { integrationMailerLiteService } from "@chatbotx.io/business"
import { integration as mailerLiteIntegration } from "@chatbotx.io/integration-mailer-lite"
import { normalizeError } from "universal-error-normalizer"
import { workspaceIdrequestParams } from "@/features/common/schemas"
import { logger } from "@/lib/log"
import { workspaceActionClient } from "@/lib/safe-action"
import { connectMailerLiteSchema } from "../schemas"

export const connectMailerLiteAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(connectMailerLiteSchema)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) => {
    try {
      const auth = await mailerLiteIntegration.runAction(
        "validateCredentials",
        { props: parsedInput },
      )
      await integrationMailerLiteService.upsert({ workspaceId, auth })
    } catch (error) {
      logger.error(
        { err: normalizeError(error), workspaceId },
        "Failed to connect MailerLite",
      )
      throw error
    }
  })
