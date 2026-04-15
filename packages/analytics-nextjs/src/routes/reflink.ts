import {
  listFlowNodeContactsResponse,
  magicLinkAnalyticsService,
  magicLinkContactStatsSchema,
  magicLinkStatsSchema,
  magicLinkTimeseriesRow,
} from "@chatbotx.io/analytics"
import { os } from "@orpc/server"
import { z } from "zod"

export const analyticsReflinkRoutes = os.router({
  magicLinkStats: os
    .route({
      method: "GET",
      path: "/analytics/magic-links-stats",
      summary: "Get magic link stats",
      tags: ["Analytics"],
    })
    .input(magicLinkStatsSchema)
    .output(z.object({ data: z.array(magicLinkTimeseriesRow) }))
    .handler(async ({ input }) => {
      const data =
        await magicLinkAnalyticsService.getMagicLinkStatsByDateRange(input)
      return { data }
    }),
  magicLinkContacts: os
    .route({
      method: "GET",
      path: "/analytics/magic-links-contacts",
      summary: "Get magic link contacts",
      tags: ["Analytics"],
    })
    .input(magicLinkContactStatsSchema)
    .output(listFlowNodeContactsResponse)
    .handler(async ({ input }) => {
      return await magicLinkAnalyticsService.getMagicLinkContactStats(input)
    }),
})
