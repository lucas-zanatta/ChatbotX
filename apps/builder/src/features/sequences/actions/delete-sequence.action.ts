"use server"

import { prisma } from "@aha.chat/database"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"

export const deleteSequenceAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId, id],
    }: {
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
    }) => {
      const sequence = await prisma.sequence.findFirstOrThrow({
        where: {
          id,
          chatbotId,
        },
      })

      await prisma.sequence.delete({
        where: {
          id: sequence.id,
        },
      })

      revalidateCacheTags([`chatbots:${chatbotId}#sequences`])
    },
  )
