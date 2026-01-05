"use server"

import { prisma } from "@aha.chat/database"
import { z } from "zod"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { recalculateAllContactsInSequence } from "@/features/contact-sequences/utils/calculate-next-run-at"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"

const deleteSequenceStepRequest = z.object({
  stepId: z.string(),
  sequenceId: z.string(),
})

type DeleteSequenceStepRequest = z.infer<typeof deleteSequenceStepRequest>

async function validateSequenceOwnership(
  sequenceId: string,
  chatbotId: string,
) {
  await prisma.sequence.findFirstOrThrow({
    where: { id: sequenceId, chatbotId },
  })
}

async function deleteStep(stepId: string, chatbotId: string) {
  const step = await prisma.sequenceStep.findFirstOrThrow({
    where: { id: stepId },
    include: { sequence: true },
  })

  if (step.sequence.chatbotId !== chatbotId) {
    throw new Error("Unauthorized: Step does not belong to this chatbot")
  }

  await prisma.sequenceStep.delete({
    where: { id: stepId },
  })
}

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

      await validateSequenceOwnership(sequenceId, chatbotId)
      await deleteStep(stepId, chatbotId)
      await recalculateAllContactsInSequence(sequenceId, chatbotId)

      revalidateCacheTags([`chatbots:${chatbotId}#sequences`])

      return { success: true }
    },
  )
