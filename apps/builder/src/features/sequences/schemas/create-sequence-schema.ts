import { z } from "zod"

export const createSequenceRequest = z.object({
  name: z.string().trim().min(1, "Name is required"),
})

export type CreateSequenceRequest = z.infer<typeof createSequenceRequest>
