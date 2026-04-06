import { sequencesChatbotAuthAPI } from "./authorized"
import { sequencesPrivateAPI } from "./private"

export const sequencesAPI = {
  ...sequencesChatbotAuthAPI,
  ...sequencesPrivateAPI,
}
