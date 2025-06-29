import {
  BroadcastSchedulesType,
  BroadcastSubaction,
  filterOperators,
  InboxType,
} from "@ahachat.ai/database/types"
import { z } from "zod"

export const contactFilterRequest = z.object({
  joinOperator: z.enum(["AND", "OR"]),
  conditions: z.array(
    z.object({
      attribute: z.string().trim(),
      condition: filterOperators,
      value: z.string().trim(),
    }),
  ),
})

export const createBroadcastRequest = z.object({
  inboxType: z.nativeEnum(InboxType).nullable(),
  flowId: z.string().cuid2(),
  subaction: z.nativeEnum(BroadcastSubaction).nullish(),
  schedulesType: z.nativeEnum(BroadcastSchedulesType),
  schedulesAt: z
    .string()
    .refine(
      (value) => {
        const date = new Date(value)
        const currentDate = new Date()

        return !Number.isNaN(date.getTime()) && date > currentDate
      },
      {
        message: "Schedules must be after now.",
      },
    )
    .nullable(),
  contactFilter: contactFilterRequest,
})
export type CreateBroadcastRequest = z.infer<typeof createBroadcastRequest>
