"use server"

import { prisma } from "@aha.chat/database"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type UpdateSequenceSchema,
  updateSequenceSchema,
} from "../schemas/update-sequence-schema"

export const updateSequenceAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .inputSchema(updateSequenceSchema)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId, id],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
      parsedInput: UpdateSequenceSchema
    }) => {
      const sequence = await prisma.sequence.findFirstOrThrow({
        where: {
          id,
          chatbotId,
        },
      })

      await prisma.sequence.update({
        where: {
          id: sequence.id,
        },
        data: parsedInput,
      })

      revalidateCacheTags([`chatbots:${chatbotId}#sequences`])
    },
  )
