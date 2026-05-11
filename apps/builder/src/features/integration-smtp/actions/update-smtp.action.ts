"use server"

import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import { updateSmtpRequest } from "../schemas/mutation"
import { updateSmtp, verifySmtpConnection } from "../services/smtp.service"

export const updateSmtpAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(updateSmtpRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
    } = props

    if (
      parsedInput.password &&
      parsedInput.username &&
      parsedInput.fromAddress
    ) {
      await verifySmtpConnection({
        provider: parsedInput.provider ?? "other",
        host: parsedInput.host,
        port: parsedInput.port,
        username: parsedInput.username,
        password: parsedInput.password,
        fromAddress: parsedInput.fromAddress,
      })
    }

    return updateSmtp(workspaceId, id, parsedInput)
  })
