import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  errorStateDefaultFn,
  errorStateSchema,
  skipStateDefaultFn,
  skipStateSchema,
  successStateDefaultFn,
  successStateSchema,
} from "../states"
import { stepTypes } from "./step-action"

export const filterContactFields = z.enum(["ig_follow_business"])
export type FilterContactField = z.infer<typeof filterContactFields>

export const filterContactOperators = z.enum(["is", "isNot"])
export type FilterContactOperator = z.infer<typeof filterContactOperators>

export const filterContactStepSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.filterContact),
  field: filterContactFields,
  operator: filterContactOperators,
  value: z.enum(["true", "false"]),
  states: z.tuple([successStateSchema, skipStateSchema, errorStateSchema]),
})

export type FilterContactStepSchema = z.infer<typeof filterContactStepSchema>

export const filterContactStepDefaultFn = (
  props?: Partial<FilterContactStepSchema>,
): FilterContactStepSchema => ({
  id: createId(),
  stepType: stepTypes.enum.filterContact,
  field: filterContactFields.enum.ig_follow_business,
  operator: filterContactOperators.enum.is,
  value: "true",
  states: [
    successStateDefaultFn(),
    skipStateDefaultFn(),
    errorStateDefaultFn(),
  ],
  ...props,
})
