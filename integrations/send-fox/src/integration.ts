import {
  Integration,
  type IntegrationDefinition,
  SdkException,
} from "@chatbotx.io/sdk"
import { sendFoxRequest } from "./client"
import {
  SEND_FOX_CONTACTS_ENDPOINT,
  SEND_FOX_LISTS_ENDPOINT,
  SEND_FOX_ME_ENDPOINT,
} from "./constants"
import {
  createSendFoxAuth,
  type SendFoxActions,
  type SendFoxAuthValue,
  type SendFoxConfig,
  sendFoxContactSchema,
  sendFoxCreateContactPayloadSchema,
  sendFoxListsResponseSchema,
  sendFoxMeSchema,
} from "./schemas"

const config: IntegrationDefinition<
  SendFoxConfig,
  SendFoxAuthValue,
  SendFoxActions
> = {
  name: "sendFox",
  actions: {
    validateCredentials: async ({ props }) => {
      const auth = createSendFoxAuth(props.accessToken)
      await sendFoxRequest(auth, SEND_FOX_ME_ENDPOINT, sendFoxMeSchema)
    },
    listLists: async ({ ctx }) => {
      const response = await sendFoxRequest(
        ctx.auth,
        SEND_FOX_LISTS_ENDPOINT,
        sendFoxListsResponseSchema,
      )
      return response.data
    },
    createContact: async ({ ctx, props }) => {
      const payload = sendFoxCreateContactPayloadSchema.parse({
        email: props.email,
        first_name: props.firstName || undefined,
        last_name: props.lastName || undefined,
        lists: props.listIds?.length ? props.listIds : undefined,
      })
      return await sendFoxRequest(
        ctx.auth,
        SEND_FOX_CONTACTS_ENDPOINT,
        sendFoxContactSchema,
        { method: "post", json: payload },
      )
    },
  },
  disconnect: async () => undefined,
  handleRequest: () =>
    Promise.reject(
      new SdkException("SendFox does not expose request handlers"),
    ),
}

export const integration = new Integration(config)
