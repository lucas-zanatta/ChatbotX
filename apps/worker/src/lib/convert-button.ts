import { buildInboxLink } from "@chatbotx.io/business/inbox/utils"
import type { InboxWithIntegrations } from "@chatbotx.io/database/types"
import type { PageElementSchema } from "@chatbotx.io/flow-config"

type ConvertButtonParams = {
  appUrl: string
  button: Extract<PageElementSchema, { type: "button" }>
  inbox: InboxWithIntegrations | undefined
  flowId?: string
}
export function resolveButtonUrl({
  appUrl,
  button,
  inbox,
  flowId,
}: ConvertButtonParams): string | undefined {
  if (button.buttonType === "openWebsite") {
    return button.beforeStep.url
  }
  if (!inbox) {
    return
  }
  if (button.buttonType === "startExternalFlow") {
    return buildInboxLink(appUrl, inbox, {
      type: "flow",
      f: button.beforeStep.flowId,
    })
  }
  if (button.buttonType === "startExternalNode") {
    return buildInboxLink(appUrl, inbox, {
      type: "flow",
      f: button.beforeStep.flowId,
      n: button.beforeStep.nodeId,
    })
  }
  if (
    button.buttonType === "sendMessage" ||
    button.buttonType === "performAction" ||
    button.buttonType === "startAnotherNode"
  ) {
    const refConfig = flowId
      ? {
          type: "flow",
          f: flowId,
          n: button.beforeStep.nodeId,
        }
      : undefined
    return buildInboxLink(appUrl, inbox, refConfig)
  }
}
