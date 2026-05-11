import type { ChannelType } from "@chatbotx.io/database/partials"
import type { InboxWithIntegrations } from "@chatbotx.io/database/types"
import { encodeRef, type RefConfig } from "../referral"

type linkConfigs = {
  format: string
  username: string
  refKey: string
  refValue?: string
}

export function buildInboxLink(
  appUrl: string,
  inbox: InboxWithIntegrations,
  refConfig?: RefConfig,
): string | undefined {
  const refValue = refConfig ? encodeRef(refConfig) : undefined
  const allLinkConfigs: Record<ChannelType, linkConfigs | undefined> = {
    messenger: {
      format: "https://m.me/{username}",
      username: inbox.sourceId,
      refKey: "ref",
      refValue,
    },
    instagram: {
      format: "https://ig.me/m/{username}",
      username: inbox.integrationInstagram?.username ?? "",
      refKey: "ref",
      refValue,
    },
    whatsapp: {
      format: "https://wa.me/{username}",
      username: inbox.integrationWhatsapp?.displayPhoneNumber ?? "",
      refKey: "text",
      refValue: refValue ? `/${refValue}` : undefined,
    },
    telegram: {
      format: "https://t.me/{username}",
      username: inbox.name,
      refKey: "start",
      refValue,
    },
    zalo: {
      format: "https://zalo.me/{username}",
      username: inbox.sourceId,
      refKey: "ref",
      refValue,
    },
    webchat: {
      format: `${appUrl}/webchat?workspaceId=${inbox.workspaceId}&webchatId=${inbox.sourceId}`,
      username: "",
      refKey: "ref",
      refValue,
    },
    smtp: undefined,
    omnichannel: undefined,
  }
  const config = allLinkConfigs[inbox.channel as ChannelType]

  if (!config) {
    return
  }

  let link = config.format.replace("{username}", config.username)
  if (config.refValue) {
    const separator = link.includes("?") ? "&" : "?"
    link += `${separator}${config.refKey}=${encodeURIComponent(
      config.refValue,
    )}`
  }
  return link
}
