"use server"

import { prisma } from "@aha.chat/database"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type CreateSequenceRequest,
  createSequenceRequest,
} from "../schemas/create-sequence-schema"

export const createSequenceAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(createSequenceRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: CreateSequenceRequest
    }) => {
      const sequence = await prisma.sequence.create({
        data: {
          chatbotId,
          name: parsedInput.name,
        },
      })

      revalidateCacheTags([`chatbots:${chatbotId}#sequences`])

      return { sequenceId: sequence.id }
    },
  )
