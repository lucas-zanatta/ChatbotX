"use server"

import { prisma } from "@aha.chat/database"
import { z } from "zod"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"

const toggleSequenceStatusSchema = z.object({
  sequenceId: z.string().cuid2(),
  active: z.boolean(),
})

export const toggleSequenceStatusAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(toggleSequenceStatusSchema)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: z.infer<typeof toggleSequenceStatusSchema>
    }) => {
      await prisma.sequence.update({
        where: {
          id: parsedInput.sequenceId,
          chatbotId,
        },
        data: {
          active: parsedInput.active,
        },
      })

      revalidateCacheTags([`chatbots:${chatbotId}#sequences`])

      return { success: true }
    },
  )
