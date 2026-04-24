import {
  createSelectSchema,
  messengerMessageTemplateModel,
} from "@chatbotx.io/database/schema"
import { z } from "zod"

export const messengerMessageTemplateResource = createSelectSchema(
  messengerMessageTemplateModel,
  {
    id: z.string(),
  },
)
  .pick({
    id: true,
    name: true,
    language: true,
    category: true,
    status: true,
    components: true,
    integrationMessengerId: true,
  })
  .extend({
    components: z.any(),
  })
export type MessengerMessageTemplateResource = z.infer<
  typeof messengerMessageTemplateResource
>

export const messageTemplateWithComponents =
  messengerMessageTemplateResource.extend({
    components: z.any(),
    sourceId: z.string(),
  })
export type MessageTemplateWithComponents = z.infer<
  typeof messageTemplateWithComponents
>

export const flowTemplateResource = messengerMessageTemplateResource.extend({
  integrationMessenger: z
    .object({
      id: z.string(),
      inboxId: z.string(),
    })
    .nullish(),
})
export type FlowTemplateResource = z.infer<typeof flowTemplateResource>
