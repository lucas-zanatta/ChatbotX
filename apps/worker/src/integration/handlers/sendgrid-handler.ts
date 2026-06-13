import { createHash } from "node:crypto"
import { buildContext, integrationSendGridService } from "@chatbotx.io/business"
import { systemFieldTypes } from "@chatbotx.io/database/partials"
import { encryptedDataSchema, encryptUtils } from "@chatbotx.io/encryption"
import type { SendGridAddContactSchema } from "@chatbotx.io/flow-config"
import {
  SendGridApiError,
  type SendGridAuthValue,
  sendGridAuthSchema,
  integration as sendGridIntegration,
} from "@chatbotx.io/integration-sendgrid"
import { normalizeError } from "universal-error-normalizer"
import { logger } from "../../lib/logger"
import { getContactFieldMap } from "./contact-field-map"
import type { ExecuteStepProps } from "./flow"
import type { ExecuteStepResult } from "./step"

const WHITESPACE_PATTERN = /\s+/

const splitFullName = (fullName: string) => {
  const parts = fullName.trim().split(WHITESPACE_PATTERN).filter(Boolean)
  return { firstName: parts[0] ?? "", lastName: parts.slice(1).join(" ") }
}

export const addSendGridContact = async (
  props: ExecuteStepProps<SendGridAddContactSchema>,
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
      integrationSendGridService.findByWorkspaceIdOrFail(
        conversation.workspaceId,
      ),
      getContactFieldMap({
        workspaceId: conversation.workspaceId,
        contactId: conversation.contactId,
      }),
    ])
    const auth = await encryptUtils.decryptObject(
      encryptedDataSchema.parse(row.auth),
      sendGridAuthSchema,
    )
    const email = fields[step.emailField]?.trim().toLowerCase()
    if (!email) {
      return {
        status: "error",
        errorMessage: "SendGrid contact email is empty",
        result: null,
      }
    }

    const fallbackName = splitFullName(
      fields[systemFieldTypes.enum.full_name] ?? "",
    )
    const firstName =
      fields[systemFieldTypes.enum.first_name]?.trim() || fallbackName.firstName
    const lastName =
      fields[systemFieldTypes.enum.last_name]?.trim() || fallbackName.lastName
    const phone = step.phoneField
      ? fields[step.phoneField]?.trim() || undefined
      : undefined
    const customFields: Record<string, string> = {}
    for (const mapping of step.mergeFields) {
      const value = fields[mapping.contactFieldId]?.trim()
      if (value && !customFields[mapping.sendGridField]) {
        customFields[mapping.sendGridField] = value
      }
    }

    const ctx = await buildContext<SendGridAuthValue>({
      workspaceId: conversation.workspaceId,
      integrationType: "sendGrid",
      integration: { ...row, auth },
    })
    const accepted = await sendGridIntegration.runAction("addOrUpdateContact", {
      ctx,
      props: {
        ...(step.listId ? { list_ids: [step.listId] } : {}),
        contacts: [
          {
            email,
            ...(firstName ? { first_name: firstName } : {}),
            ...(lastName ? { last_name: lastName } : {}),
            ...(phone ? { phone_number_id: phone } : {}),
            ...(Object.keys(customFields).length > 0
              ? { custom_fields: customFields }
              : {}),
          },
        ],
      },
    })
    logger.info(
      {
        ...logContext,
        jobIdFingerprint: createHash("sha256")
          .update(accepted.job_id)
          .digest("hex"),
        providerStatus: 202,
      },
      "SendGrid accepted contact update",
    )
    return { status: "success", result: null }
  } catch (error) {
    const normalized = normalizeError(error)
    logger.error(
      {
        ...logContext,
        message: normalized.message,
        statusCode:
          error instanceof SendGridApiError ? error.statusCode : undefined,
      },
      "SendGrid add-contact step failed",
    )
    return { status: "error", errorMessage: normalized.message, result: null }
  }
}
