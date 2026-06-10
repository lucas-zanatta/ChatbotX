import { z } from "zod"

export const connectDripSchema = z.object({
  apiToken: z.string().trim().min(1),
  accountId: z
    .string()
    .trim()
    .min(1)
    .regex(/^\d+$/, "Account ID must be a positive numeric string"),
})
