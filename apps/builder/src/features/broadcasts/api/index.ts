import { broadcastChatbotTokenAPIs } from "./chatbot-token"
import { broadcastPrivateAPIs } from "./private"

export const broadcastAPIs = {
  ...broadcastChatbotTokenAPIs,
  ...broadcastPrivateAPIs,
}
