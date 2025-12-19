import { z } from "zod"

export const upsertSequenceStepRequest = z.object({
  stepId: z.string().optional(), // If provided, update; otherwise create
  sequenceId: z.string(),
  order: z.number().int().min(0),
  delayDays: z.number().int().min(0).default(0),
  delayHours: z.number().int().min(0).default(0),
  delayUnit: z
    .enum(["immediate", "minutes", "hours", "days", "specificTime"])
    .default("days"),
  specificDateTime: z.string().datetime().optional(),
  flowId: z.string(),
  isActive: z.boolean().default(true),
  anytime: z.boolean().default(true),
  sendTimeStart: z.string().optional(), // HH:mm format
  sendTimeEnd: z.string().optional(), // HH:mm format
  sendDays: z
    .array(z.string())
    .default([
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
    ]),
})

export type UpsertSequenceStepRequest = z.infer<
  typeof upsertSequenceStepRequest
>
