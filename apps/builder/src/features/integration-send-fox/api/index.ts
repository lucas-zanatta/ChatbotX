import { buildContext } from "@chatbotx.io/business"
import {
  SendFoxApiError,
  sendFoxListSchema,
} from "@chatbotx.io/integration-send-fox"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { ORPCError } from "@orpc/server"
import { z } from "zod"
import { integrations } from "@/integration"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { getSendFoxAuth } from "../queries"

const workspaceInput = z.object({ workspaceId: zodBigintAsString() })

export const integrationSendFoxAPI = {
  listLists: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/send-fox/lists",
      summary: "List SendFox lists",
      tags: ["SendFox"],
    })
    .input(workspaceInput)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(z.object({ data: z.array(sendFoxListSchema) }))
    .handler(async ({ input }) => {
      const { auth, row } = await getSendFoxAuth(input.workspaceId)
      const ctx = await buildContext({
        workspaceId: input.workspaceId,
        integrationType: "sendFox",
        integration: { ...row, auth },
      })
      try {
        return {
          data: await integrations.sendFox.runAction("listLists", {
            ctx,
            props: {},
          }),
        }
      } catch (error) {
        if (error instanceof SendFoxApiError && error.statusCode === 429) {
          throw new ORPCError("TOO_MANY_REQUESTS", {
            status: 429,
            message: error.message,
          })
        }
        throw error
      }
    }),
}
