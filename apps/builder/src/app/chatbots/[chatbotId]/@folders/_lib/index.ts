import { FolderType } from "@aha.chat/database/enums"

export function getFolderTypeFromFeature(
  featureName?: string,
): FolderType | null {
  if (!featureName) {
    return null
  }

  switch (featureName) {
    case "automated-responses":
      return "automatedResponse"
    case "flows":
      return "flow"
    case "account-fields":
    case "custom-fields":
      return "customField"
    case "tags":
      return FolderType.tag
    case "triggers":
      return FolderType.trigger
    case "webhooks":
      return FolderType.webhook
    default:
      return null
  }
}
