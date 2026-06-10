import { z } from "zod"

export const connectSendFoxSchema = z.object({
  accessToken: z.string().trim().min(1),
})
