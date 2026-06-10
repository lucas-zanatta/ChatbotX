import {
  AuthType,
  type BaseConfig,
  type Context,
  customAuthSchema,
  type Handler,
} from "@chatbotx.io/sdk"
import { z } from "zod"

export type SendFoxConfig = BaseConfig

export const sendFoxAuthSchema = customAuthSchema.extend({
  authType: z.literal(AuthType.custom),
  accessToken: z.string().trim().min(1),
})
export type SendFoxAuthValue = z.infer<typeof sendFoxAuthSchema>

export const createSendFoxAuth = (accessToken: string): SendFoxAuthValue =>
  sendFoxAuthSchema.parse({
    authType: AuthType.custom,
    accessToken: accessToken.trim(),
  })

export const sendFoxMeSchema = z.object({
  id: z.number().optional(),
  email: z.string().optional(),
  name: z.string().optional(),
})

export const sendFoxListSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
})
export type SendFoxList = z.infer<typeof sendFoxListSchema>

export const sendFoxListsResponseSchema = z.object({
  data: z.array(sendFoxListSchema).default([]),
})

export const sendFoxContactSchema = z.object({
  id: z.number().int().positive(),
  email: z.string(),
})
export type SendFoxContact = z.infer<typeof sendFoxContactSchema>

export const sendFoxCreateContactPayloadSchema = z.object({
  email: z.string().min(1),
  first_name: z.string().min(1).optional(),
  last_name: z.string().min(1).optional(),
  lists: z.array(z.number().int().positive()).min(1).optional(),
})

export const sendFoxErrorSchema = z.object({
  message: z.string().optional(),
  errors: z.record(z.string(), z.array(z.string())).optional(),
})

export type SendFoxActions = {
  validateCredentials: Handler<{ props: { accessToken: string } }, void>
  listLists: Handler<
    { ctx: Context<SendFoxAuthValue>; props: Record<string, never> },
    SendFoxList[]
  >
  createContact: Handler<
    {
      ctx: Context<SendFoxAuthValue>
      props: {
        email: string
        firstName?: string
        lastName?: string
        listIds?: number[]
      }
    },
    SendFoxContact
  >
}
