import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { uploadModes } from "../types"
import { buttonStepSchema } from "./button"
import { stepTypes } from "./step-action"

export const pageElementTypes = z.enum([
  "Heading",
  "Text",
  "Image",
  "Button",
  "Spacing",
  "Code",
  "Line",
])
export type PageElementType = z.infer<typeof pageElementTypes>

export const pageElementSchema = z.discriminatedUnion("type", [
  z.object({
    id: zodBigintAsString(),
    type: z.enum([
      pageElementTypes.enum.Heading,
      pageElementTypes.enum.Text,
      pageElementTypes.enum.Code,
    ]),
    text: z.string(),
  }),
  z.object({
    id: zodBigintAsString(),
    type: z.enum([pageElementTypes.enum.Image]),
    url: z.string().optional(),
    mode: z
      .union([
        z.literal(uploadModes.enum.file),
        z.literal(uploadModes.enum.url),
      ])
      .optional(),
  }),
  z.object({
    id: zodBigintAsString(),
    type: z.enum([pageElementTypes.enum.Line, pageElementTypes.enum.Spacing]),
  }),
  z.object({
    id: zodBigintAsString(),
    type: z.literal(pageElementTypes.enum.Button),
    beforeStep: buttonStepSchema.nullable(),
  }),
])
export type PageElementSchema = z.infer<typeof pageElementSchema>

export const emailStepSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.email),
  integrationSmtpId: z.string().trim(),
  topicId: z.string().trim().optional(),
  from: z.string().trim(),
  to: z.string().trim(),
  subject: z.string().trim(),
  preheader: z.string().trim(),
  elements: z.array(pageElementSchema),
})
export type EmailStepSchema = z.infer<typeof emailStepSchema>

export const emailStepDefaultFn = (
  props: Partial<EmailStepSchema> = {},
): EmailStepSchema => ({
  integrationSmtpId: "",
  topicId: "",
  from: "{{email}}",
  to: "",
  subject: "",
  preheader: "",
  elements: [],
  ...props,
  id: createId(),
  stepType: stepTypes.enum.email,
})
