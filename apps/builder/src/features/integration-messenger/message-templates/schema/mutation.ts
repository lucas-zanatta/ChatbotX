import { z } from "zod"

const templateVariableSchema = z.object({
  key: z.string(),
  example: z.string().min(1),
})

const templateButtonSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("POSTBACK"),
    title: z.string().min(1).max(20),
  }),
  z.object({
    type: z.literal("PHONE_NUMBER"),
    title: z.string().min(1).max(20),
    phoneNumber: z.string().min(1),
  }),
  z.object({
    type: z.literal("URL"),
    title: z.string().min(1).max(20),
    url: z.string().min(1),
    variables: z.array(z.string()).default([]),
  }),
])

export const createMessengerMessageTemplateRequest = z
  .object({
    name: z
      .string()
      .trim()
      .min(1)
      .max(512)
      .regex(/^[a-z0-9_]+$/),
    language: z.string().min(1),
    headerType: z.enum(["none", "text", "text_and_image"]),
    headerText: z.string().default(""),
    headerVariables: z.array(templateVariableSchema).max(1).default([]),
    headerImageUrl: z.string().url().optional(),
    body: z.string().min(1),
    bodyVariables: z.array(templateVariableSchema).max(9).default([]),
    buttons: z.array(templateButtonSchema).max(3).default([]),
  })
  .superRefine((value, ctx) => {
    if (value.headerType !== "none" && value.headerText.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Header text is required",
        path: ["headerText"],
      })
    }

    if (value.headerType === "text_and_image" && !value.headerImageUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Header image is required",
        path: ["headerImageUrl"],
      })
    }
  })

export type CreateMessengerMessageTemplateRequest = z.infer<
  typeof createMessengerMessageTemplateRequest
>
