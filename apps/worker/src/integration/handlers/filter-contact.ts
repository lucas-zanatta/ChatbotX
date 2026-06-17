import { db } from "@chatbotx.io/database/client"
import { channelTypes } from "@chatbotx.io/database/partials"
import type { ContactModel } from "@chatbotx.io/database/types"
import type { FilterContactStepSchema } from "@chatbotx.io/flow-config"
import {
  fetchInstagramContactProfile,
  type InstagramAuthValue,
} from "@chatbotx.io/integration-instagram"
import { logger } from "../../lib/logger"
import type { ExecuteStepProps } from "./flow-utils"
import type { ExecuteStepResult } from "./step"

export async function filterContact({
  contactInbox,
  conversation,
  step,
}: ExecuteStepProps<FilterContactStepSchema>): Promise<ExecuteStepResult> {
  try {
    const contact = await db.query.contactModel.findFirst({
      where: { id: conversation.contactId },
    })

    if (!contact) {
      return {
        status: "error",
        result: null,
        errorMessage: "Contact not found",
      }
    }

    const actualValue = await resolveFilterValue({
      contact,
      contactInbox,
      step,
      workspaceId: conversation.workspaceId,
    })
    const isMatch = evaluateFilter({
      actualValue,
      expectedValue: step.value,
      operator: step.operator,
    })

    return {
      status: isMatch ? "success" : "skip",
      result: { actualValue },
    }
  } catch (err) {
    logger.error(
      { err, conversationId: conversation.id, stepId: step.id },
      "[filterContact] failed",
    )

    return {
      status: "error",
      result: null,
      errorMessage: err instanceof Error ? err.message : "Filter failed",
    }
  }
}

const resolveFilterValue = async ({
  contact: _contact,
  contactInbox,
  step,
  workspaceId,
}: {
  contact: ContactModel
  contactInbox: ExecuteStepProps<FilterContactStepSchema>["contactInbox"]
  step: FilterContactStepSchema
  workspaceId: string
}): Promise<string | null> => {
  switch (step.field) {
    case "ig_follow_business": {
      if (contactInbox.channel !== channelTypes.enum.instagram) {
        return null
      }

      const integrationInstagram =
        await db.query.integrationInstagramModel.findFirst({
          where: {
            inboxId: contactInbox.inboxId,
            workspaceId,
          },
        })

      if (!integrationInstagram) {
        return null
      }

      const auth = integrationInstagram.auth as InstagramAuthValue
      const profile = await fetchInstagramContactProfile({
        igsid: contactInbox.sourceId,
        accessToken: auth.tokens.accessToken,
        version: auth.metadata.version,
      })

      return profile.followsBusiness == null
        ? null
        : String(profile.followsBusiness)
    }
    default:
      return null
  }
}

const evaluateFilter = ({
  actualValue,
  expectedValue,
  operator,
}: {
  actualValue: string | null
  expectedValue: string
  operator: FilterContactStepSchema["operator"]
}) => {
  const normalizedActual = actualValue ?? "false"

  switch (operator) {
    case "is":
      return normalizedActual === expectedValue
    case "isNot":
      return normalizedActual !== expectedValue
    default:
      return false
  }
}
