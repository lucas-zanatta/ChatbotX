import { createHash } from "node:crypto"
import { buildContext, integrationSendFoxService } from "@chatbotx.io/business"
import { systemFieldTypes } from "@chatbotx.io/database/partials"
import { encryptedDataSchema, encryptUtils } from "@chatbotx.io/encryption"
import type { SendFoxCreateContactSchema } from "@chatbotx.io/flow-config"
import {
  integration as integrationSendFox,
  SEND_FOX_HTTP_TIMEOUT_MS,
  sendFoxAuthSchema,
} from "@chatbotx.io/integration-send-fox"
import { distributedLock } from "@chatbotx.io/redis"
import { normalizeError } from "universal-error-normalizer"
import { logger } from "../../lib/logger"
import { getContactFieldMap } from "./contact-field-map"
import type { ExecuteStepProps } from "./flow"
import type { ExecuteStepResult } from "./step"

export const SEND_FOX_LOCK_TIMEOUT_SECONDS = 30
const WHITESPACE_PATTERN = /\s+/

if (SEND_FOX_HTTP_TIMEOUT_MS >= SEND_FOX_LOCK_TIMEOUT_SECONDS * 1000) {
  throw new Error("SendFox HTTP timeout must be lower than lock timeout")
}

const splitFullName = (fullName: string) => {
  const parts = fullName.trim().split(WHITESPACE_PATTERN).filter(Boolean)
  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
  }
}

export const createSendFoxContact = async (
  props: ExecuteStepProps<SendFoxCreateContactSchema>,
): Promise<ExecuteStepResult> => {
  const { conversation, step } = props
  const logContext = {
    workspaceId: conversation.workspaceId,
    conversationId: conversation.id,
    stepId: step.id,
    listId: step.listId,
  }

  try {
    const [row, fields] = await Promise.all([
      integrationSendFoxService.findByWorkspaceIdOrFail(
        conversation.workspaceId,
      ),
      getContactFieldMap({
        workspaceId: conversation.workspaceId,
        contactId: conversation.contactId,
      }),
    ])
    const auth = await encryptUtils.decryptObject(
      encryptedDataSchema.parse(row.auth),
      sendFoxAuthSchema,
    )
    const email = fields[step.emailField]?.trim().toLowerCase()
    if (!email) {
      throw new Error("SendFox contact email is empty")
    }

    const fallbackName = splitFullName(
      fields[systemFieldTypes.enum.full_name] ?? "",
    )
    const firstName =
      fields[systemFieldTypes.enum.first_name]?.trim() || fallbackName.firstName
    const lastName =
      fields[systemFieldTypes.enum.last_name]?.trim() || fallbackName.lastName
    const listId = step.listId ? Number.parseInt(step.listId, 10) : undefined
    if (listId !== undefined && !(Number.isSafeInteger(listId) && listId > 0)) {
      throw new Error("SendFox list ID is invalid")
    }
    const ctx = await buildContext({
      workspaceId: conversation.workspaceId,
      integrationType: "sendFox",
      integration: { ...row, auth },
    })
    const fingerprint = createHash("sha256")
      .update(auth.accessToken)
      .digest("hex")
    const lockKey = `send-fox:create-contact:${fingerprint}`

    await distributedLock.runExclusive({
      key: lockKey,
      timeoutInSeconds: SEND_FOX_LOCK_TIMEOUT_SECONDS,
      fn: async () => {
        await integrationSendFox.runAction("createContact", {
          ctx,
          props: {
            email,
            firstName: firstName || undefined,
            lastName: lastName || undefined,
            listIds: listId === undefined ? undefined : [listId],
          },
        })
      },
    })

    return { status: "success", result: null }
  } catch (error) {
    const normalized = normalizeError(error)
    logger.error(
      { ...logContext, error: normalized },
      "SendFox create-contact step failed",
    )
    return {
      status: "error",
      errorMessage: normalized.message,
      result: null,
    }
  }
}
