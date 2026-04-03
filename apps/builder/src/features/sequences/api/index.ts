import { sequencesChatbotAuthAPI } from "./chatbot-auth"
import { sequencesPrivateAPI } from "./private"

export const sequencesAPI = {
  ...sequencesChatbotAuthAPI,
  ...sequencesPrivateAPI,
}
