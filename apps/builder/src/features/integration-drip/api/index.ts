import { buildContext } from "@chatbotx.io/business"
import {
  DripApiError,
  dripCustomFieldSchema,
} from "@chatbotx.io/integration-drip"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { ORPCError } from "@orpc/server"
import { z } from "zod"
import { integrations } from "@/integration"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { getDripAuth } from "../queries"

const workspaceInput = z.object({ workspaceId: zodBigintAsString() })

export const integrationDripAPI = {
  listTags: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/drip/tags",
      summary: "List Drip tags",
      tags: ["Drip"],
    })
    .input(workspaceInput)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(z.object({ data: z.array(z.string()) }))
    .handler(async ({ input }) => {
      const { auth, row } = await getDripAuth(input.workspaceId)
      const ctx = await buildContext({
        workspaceId: input.workspaceId,
        integrationType: "drip",
        integration: { ...row, auth },
      })
      try {
        return {
          data: await integrations.drip.runAction("listTags", {
            ctx,
            props: {},
          }),
        }
      } catch (error) {
        if (error instanceof DripApiError && error.statusCode === 429) {
          throw new ORPCError("TOO_MANY_REQUESTS", {
            status: 429,
            message: error.message,
          })
        }
        throw error
      }
    }),

  listCustomFields: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/drip/custom-fields",
      summary: "List Drip custom fields",
      tags: ["Drip"],
    })
    .input(workspaceInput)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(z.object({ data: z.array(dripCustomFieldSchema) }))
    .handler(async ({ input }) => {
      const { auth, row } = await getDripAuth(input.workspaceId)
      const ctx = await buildContext({
        workspaceId: input.workspaceId,
        integrationType: "drip",
        integration: { ...row, auth },
      })
      try {
        return {
          data: await integrations.drip.runAction("listCustomFields", {
            ctx,
            props: {},
          }),
        }
      } catch (error) {
        if (error instanceof DripApiError && error.statusCode === 429) {
          throw new ORPCError("TOO_MANY_REQUESTS", {
            status: 429,
            message: error.message,
          })
        }
        throw error
      }
    }),
}
