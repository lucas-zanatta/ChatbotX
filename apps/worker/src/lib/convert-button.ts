import type {
  InboxModel,
  IntegrationInstagramModel,
  IntegrationMessengerModel,
  IntegrationTelegramModel,
  IntegrationWebchatModel,
  IntegrationWhatsappModel,
  IntegrationZaloModel,
} from "@chatbotx.io/database/types"
import type { PageElementSchema } from "@chatbotx.io/flow-config"
import { env } from "../env"

export type InboxWithIntegrations = InboxModel & {
  integrationInstagram?: IntegrationInstagramModel | null
  integrationMessenger?: IntegrationMessengerModel | null
  integrationTelegram?: IntegrationTelegramModel | null
  integrationWebchat?: IntegrationWebchatModel | null
  integrationWhatsapp?: IntegrationWhatsappModel | null
  integrationZalo?: IntegrationZaloModel | null
}

export function buildInboxLink(
  inbox: InboxWithIntegrations,
  ref?: string,
): string {
  if (inbox.channel === "messenger") {
    const url = new URL("", `https://m.me/${inbox.sourceId}`)
    if (ref) {
      url.searchParams.set("ref", ref)
    }
    return url.toString()
  }
  if (inbox.channel === "instagram") {
    const url = new URL(
      "",
      `https://ig.me/m/${inbox.integrationInstagram?.username ?? ""}`,
    )
    if (ref) {
      url.searchParams.set("ref", ref)
    }
    return url.toString()
  }
  if (inbox.channel === "whatsapp") {
    const auth = inbox.integrationWhatsapp?.auth as {
      metadata?: { phoneNumber?: { display_phone_number?: string } }
    } | null
    const phone = auth?.metadata?.phoneNumber?.display_phone_number ?? ""
    const url = new URL("", `https://wa.me/${phone}`)
    if (ref) {
      url.searchParams.set("text", `/${ref}`)
    }
    return url.toString()
  }
  if (inbox.channel === "telegram") {
    const url = new URL("", `https://t.me/${inbox.name}`)
    if (ref) {
      url.searchParams.set("start", ref)
    }
    return url.toString()
  }
  if (inbox.channel === "webchat") {
    const url = new URL(
      `/webchat?workspaceId=${inbox.workspaceId}&webchatId=${inbox.sourceId}`,
      env.NEXT_PUBLIC_BUILDER_URL,
    )
    if (ref) {
      url.searchParams.set("ref", ref)
    }
    return url.toString()
  }
  if (inbox.channel === "zalo") {
    const url = new URL("", `https://zalo.me/${inbox.sourceId}`)
    if (ref) {
      url.searchParams.set("ref", ref)
    }
    return url.toString()
  }
  const url = new URL(
    `/link?workspaceId=${inbox.workspaceId}`,
    env.NEXT_PUBLIC_BUILDER_URL,
  )
  if (ref) {
    url.searchParams.set("ref", ref)
  }
  return url.toString()
}

export function buildFlowRef(flowId: string, nodeId?: string): string {
  return nodeId ? `flow-${flowId}:${nodeId}` : `flow-${flowId}`
}

export function resolveButtonUrl(
  beforeStep: NonNullable<
    Extract<PageElementSchema, { type: "Button" }>["beforeStep"]
  >,
  inbox: InboxWithIntegrations | undefined,
  flowId?: string,
): string | undefined {
  if (beforeStep.buttonType === "openWebsite") {
    return beforeStep.beforeStep.url
  }
  if (!inbox) {
    return
  }
  if (beforeStep.buttonType === "startExternalFlow") {
    return buildInboxLink(inbox, buildFlowRef(beforeStep.beforeStep.flowId))
  }
  if (beforeStep.buttonType === "startExternalNode") {
    return buildInboxLink(
      inbox,
      buildFlowRef(beforeStep.beforeStep.flowId, beforeStep.beforeStep.nodeId),
    )
  }
  if (
    beforeStep.buttonType === "sendMessage" ||
    beforeStep.buttonType === "performAction" ||
    beforeStep.buttonType === "startAnotherNode"
  ) {
    const ref = flowId
      ? buildFlowRef(flowId, beforeStep.beforeStep.nodeId)
      : undefined
    return buildInboxLink(inbox, ref)
  }
}
