import type { Context, OutgoingMessage } from "@chatbotx.io/sdk"
import type { ChatbotxAuthValue } from "../auth"

export const broadcastMessageToWorkspaceParty = async (
  // biome-ignore lint/correctness/noUnusedFunctionParameters: realtime broadcast disabled
  ctx: Context<ChatbotxAuthValue>,
  // biome-ignore lint/correctness/noUnusedFunctionParameters: realtime broadcast disabled
  message: OutgoingMessage,
) => {
  // const websocketClient = getRealtimeClient(ctx)
  // websocketClient
  //   .post(`/parties/workspaces/${message.workspaceId}`, {
  //     json: {
  //       eventType: "messageCreated",
  //       data: message,
  //     },
  //   })
  //   .catch(() => {
  //     // Ignore errors
  //   })
  await Promise.resolve()
}
