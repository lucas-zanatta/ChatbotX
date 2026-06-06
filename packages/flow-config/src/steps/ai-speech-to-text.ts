import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

import {
  errorStateDefaultFn,
  errorStateSchema,
  successStateDefaultFn,
  successStateSchema,
} from "../states"
import { stepTypes } from "./step-action"

export const aiSpeechToTextSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.aiSpeechToText),
  provider: z.literal("openai"),
  model: z.string().trim().min(1),
  inputFieldId: z.string().trim().min(1),
  outputFieldId: z.string().trim().min(1),
  states: z.tuple([successStateSchema, errorStateSchema]),
})
export type AISpeechToTextSchema = z.infer<typeof aiSpeechToTextSchema>

export const AISpeechToTextDefaultFn = (
  props?: Partial<AISpeechToTextSchema>,
): AISpeechToTextSchema => ({
  id: createId(),
  stepType: stepTypes.enum.aiSpeechToText,
  provider: "openai",
  model: "whisper-1",
  inputFieldId: "",
  outputFieldId: "",
  states: [successStateDefaultFn(), errorStateDefaultFn()],
  ...props,
})
