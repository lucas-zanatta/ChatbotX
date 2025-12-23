import { z } from "zod"

export const upsertSequenceStepRequest = z.object({
  stepId: z.string().optional(), // If provided, update; otherwise create
  sequenceId: z.string(),
  order: z.number().int().min(0),
  delayDays: z.number().int().min(0).optional(),
  delayMinutes: z.number().int().min(0).optional(),
  delayUnit: z
    .enum(["immediate", "minutes", "hours", "days", "specificTime"])
    .optional(),
  specificDateTime: z.string().datetime().optional(),
  flowId: z.string().optional(),
  isActive: z.boolean().optional(),
  anytime: z.boolean().optional(),
  sendTimeStart: z.string().nullable().optional(), // HH:mm format
  sendTimeEnd: z.string().nullable().optional(), // HH:mm format
  sendDays: z.array(z.string()).optional(),
})

export type UpsertSequenceStepRequest = z.infer<
  typeof upsertSequenceStepRequest
>
