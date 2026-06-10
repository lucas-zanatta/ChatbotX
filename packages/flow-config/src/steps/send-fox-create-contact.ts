import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  errorStateDefaultFn,
  errorStateSchema,
  successStateDefaultFn,
  successStateSchema,
} from "../states"
import { stepTypes } from "./step-action"

const sendFoxListIdSchema = z
  .string()
  .regex(/^\d+$/)
  .refine((value) => {
    const id = Number(value)
    return Number.isSafeInteger(id) && id > 0
  })

export const sendFoxCreateContactSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.sendFoxCreateContact),
  listId: sendFoxListIdSchema.optional(),
  emailField: z.string().min(1),
  states: z.tuple([successStateSchema, errorStateSchema]),
})
export type SendFoxCreateContactSchema = z.infer<
  typeof sendFoxCreateContactSchema
>

export const sendFoxCreateContactDefaultFn =
  (): SendFoxCreateContactSchema => ({
    id: createId(),
    stepType: stepTypes.enum.sendFoxCreateContact,
    emailField: "email",
    states: [successStateDefaultFn(), errorStateDefaultFn()],
  })
