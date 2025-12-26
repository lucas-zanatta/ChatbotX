import { z } from "zod"

export const addContactSequenceRequest = z.object({
  ids: z.array(z.string()),
  sequences: z.array(z.string()),
})

export type AddContactSequenceRequest = z.infer<
  typeof addContactSequenceRequest
>

export const removeContactSequenceRequest = z.object({
  ids: z.array(z.string()),
  sequences: z.array(z.string()),
})

export type RemoveContactSequenceRequest = z.infer<
  typeof removeContactSequenceRequest
>
