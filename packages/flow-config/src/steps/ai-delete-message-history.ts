import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

import { successStateDefaultFn, successStateSchema } from "../states"
import { stepTypes } from "./step-action"

export const aiDeleteMessageHistorySchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.aiDeleteMessageHistory),
  states: z.tuple([successStateSchema]).optional(),
})

export type AIDeleteMessageHistorySchema = z.infer<
  typeof aiDeleteMessageHistorySchema
>

export const aiDeleteMessageHistoryDefaultFn =
  (): AIDeleteMessageHistorySchema => ({
    id: createId(),
    stepType: stepTypes.enum.aiDeleteMessageHistory,
    states: [successStateDefaultFn()],
  })
