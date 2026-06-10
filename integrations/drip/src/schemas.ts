import {
  AuthType,
  type BaseConfig,
  type Context,
  customAuthSchema,
  type Handler,
} from "@chatbotx.io/sdk"
import { z } from "zod"

export type DripConfig = BaseConfig

export const dripAuthSchema = customAuthSchema.extend({
  authType: z.literal(AuthType.custom),
  apiToken: z.string().trim().min(1),
  accountId: z
    .string()
    .trim()
    .min(1)
    .regex(/^\d+$/, "Account ID must be a positive numeric string"),
})
export type DripAuthValue = z.infer<typeof dripAuthSchema>

export const createDripAuth = (
  apiToken: string,
  accountId: string,
): DripAuthValue =>
  dripAuthSchema.parse({
    authType: AuthType.custom,
    apiToken: apiToken.trim(),
    accountId: accountId.trim(),
  })

export const dripAccountSchema = z.object({
  accounts: z
    .array(
      z.object({
        id: z.union([z.string(), z.number()]),
        name: z.string().optional(),
      }),
    )
    .min(1),
})

export const dripTagsResponseSchema = z.object({
  tags: z.array(z.string()).default([]),
})

export const dripCustomFieldSchema = z.object({
  identifier: z.string(),
  label: z.string(),
})
export type DripCustomField = z.infer<typeof dripCustomFieldSchema>

export const dripCustomFieldIdentifiersResponseSchema = z.object({
  custom_field_identifiers: z
    .array(
      z.object({
        identifier: z.string(),
        label: z.string(),
      }),
    )
    .default([]),
})

export const dripSubscriberPayloadSchema = z.object({
  email: z.string().min(1),
  first_name: z.string().min(1).optional(),
  last_name: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
  tags: z.array(z.string()).min(1).optional(),
  custom_fields: z.record(z.string(), z.string()).optional(),
})
export type DripSubscriberPayload = z.infer<typeof dripSubscriberPayloadSchema>

export const dripSubscriberResponseSchema = z.object({
  subscribers: z
    .array(
      z.object({
        id: z.string().optional(),
        email: z.string().optional(),
      }),
    )
    .optional(),
})

export const dripErrorSchema = z.object({
  errors: z
    .array(
      z.object({
        code: z.string().optional(),
        message: z.string().optional(),
      }),
    )
    .optional(),
})

export type DripActions = {
  validateCredentials: Handler<
    { props: { apiToken: string; accountId: string } },
    void
  >
  listTags: Handler<
    { ctx: Context<DripAuthValue>; props: Record<string, never> },
    string[]
  >
  listCustomFields: Handler<
    { ctx: Context<DripAuthValue>; props: Record<string, never> },
    DripCustomField[]
  >
  syncSubscriber: Handler<
    {
      ctx: Context<DripAuthValue>
      props: DripSubscriberPayload
    },
    void
  >
}
