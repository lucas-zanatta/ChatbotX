import { conversationAnalyticsService } from "@chatbotx.io/analytics"
import {
  getConversationArchivedResponseSchema,
  getConversationFollowUpsResponseSchema,
  getConversationHandoffsResponseSchema,
  timeRangeQuerySchema,
} from "@chatbotx.io/analytics/schemas"
import { os } from "@orpc/server"

export const analyticsConversationRoutes = os.router({
  conversationHandoffsAnalyticsAPI: os
    .route({
      method: "GET",
      path: "/analytics/conversation-handoffs",
      summary: "Get conversation handoffs",
      tags: ["Analytics"],
    })
    .input(timeRangeQuerySchema)
    .output(getConversationHandoffsResponseSchema)
    .handler(async ({ input }) => {
      const data = await conversationAnalyticsService.getHandoffsByDay(input)
      return { data }
    }),
  conversationFollowUpsAnalyticsAPI: os
    .route({
      method: "GET",
      path: "/analytics/conversation-followups",
      summary: "Get conversation follow-ups",
      tags: ["Analytics"],
    })
    .input(timeRangeQuerySchema)
    .output(getConversationFollowUpsResponseSchema)
    .handler(async ({ input }) => {
      const data = await conversationAnalyticsService.getFollowUpsByDay(input)
      return { data }
    }),
  conversationArchivedAnalyticsAPI: os
    .route({
      method: "GET",
      path: "/analytics/conversation-archived",
      summary: "Get archived conversations",
      tags: ["Analytics"],
    })
    .input(timeRangeQuerySchema)
    .output(getConversationArchivedResponseSchema)
    .handler(async ({ input }) => {
      const data = await conversationAnalyticsService.getArchivedByDay(input)
      return { data }
    }),
})
