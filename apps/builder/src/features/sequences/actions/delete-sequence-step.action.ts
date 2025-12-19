"use server"

import { prisma } from "@aha.chat/database"
import { z } from "zod"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"

const deleteSequenceStepRequest = z.object({
  stepId: z.string(),
  sequenceId: z.string(),
})

type DeleteSequenceStepRequest = z.infer<typeof deleteSequenceStepRequest>

export const deleteSequenceStepAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(deleteSequenceStepRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: DeleteSequenceStepRequest
    }) => {
      const { stepId, sequenceId } = parsedInput

      // Verify sequence belongs to chatbot
      await prisma.sequence.findFirstOrThrow({
        where: {
          id: sequenceId,
          chatbotId,
        },
      })

      // Delete the step
      await prisma.sequenceStep.delete({
        where: { id: stepId },
      })

      revalidateCacheTags([`chatbots:${chatbotId}#sequences`])

      return { success: true }
    },
  )
