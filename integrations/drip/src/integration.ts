import {
  Integration,
  type IntegrationDefinition,
  SdkException,
} from "@chatbotx.io/sdk"
import { dripRequest } from "./client"
import {
  dripAccountPath,
  dripCustomFieldIdentifiersPath,
  dripSubscribersPath,
  dripTagsPath,
} from "./constants"
import {
  createDripAuth,
  type DripActions,
  type DripAuthValue,
  type DripConfig,
  dripAccountSchema,
  dripCustomFieldIdentifiersResponseSchema,
  dripSubscriberPayloadSchema,
  dripSubscriberResponseSchema,
  dripTagsResponseSchema,
} from "./schemas"

const config: IntegrationDefinition<DripConfig, DripAuthValue, DripActions> = {
  name: "drip",
  actions: {
    validateCredentials: async ({ props }) => {
      const auth = createDripAuth(props.apiToken, props.accountId)
      await dripRequest(
        auth,
        dripAccountPath(auth.accountId),
        dripAccountSchema,
      )
    },
    listTags: async ({ ctx }) => {
      const response = await dripRequest(
        ctx.auth,
        dripTagsPath(ctx.auth.accountId),
        dripTagsResponseSchema,
      )
      return response.tags
    },
    listCustomFields: async ({ ctx }) => {
      const response = await dripRequest(
        ctx.auth,
        dripCustomFieldIdentifiersPath(ctx.auth.accountId),
        dripCustomFieldIdentifiersResponseSchema,
      )
      return response.custom_field_identifiers.map((f) => ({
        identifier: f.identifier,
        label: f.label,
      }))
    },
    syncSubscriber: async ({ ctx, props }) => {
      const payload = dripSubscriberPayloadSchema.parse(props)
      const body = {
        subscribers: [
          {
            email: payload.email,
            ...(payload.first_name ? { first_name: payload.first_name } : {}),
            ...(payload.last_name ? { last_name: payload.last_name } : {}),
            ...(payload.phone ? { phone: payload.phone } : {}),
            ...(payload.tags?.length ? { tags: payload.tags } : {}),
            ...(payload.custom_fields &&
            Object.keys(payload.custom_fields).length > 0
              ? { custom_fields: payload.custom_fields }
              : {}),
          },
        ],
      }
      await dripRequest(
        ctx.auth,
        dripSubscribersPath(ctx.auth.accountId),
        dripSubscriberResponseSchema,
        { method: "post", json: body },
      )
    },
  },
  disconnect: async () => undefined,
  handleRequest: () =>
    Promise.reject(new SdkException("Drip does not expose request handlers")),
}

export const integration = new Integration(config)
