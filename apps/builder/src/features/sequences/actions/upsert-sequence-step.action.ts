"use server"

import { prisma } from "@aha.chat/database"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type UpsertSequenceStepRequest,
  upsertSequenceStepRequest,
} from "../schemas/upsert-sequence-step-schema"

export const upsertSequenceStepAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(upsertSequenceStepRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: UpsertSequenceStepRequest
    }) => {
      const {
        stepId,
        sequenceId,
        order,
        delayDays,
        delayHours,
        delayUnit,
        specificDateTime,
        flowId,
        isActive,
        anytime,
        sendTimeStart,
        sendTimeEnd,
        sendDays,
      } = parsedInput

      // Verify sequence belongs to chatbot
      await prisma.sequence.findFirstOrThrow({
        where: {
          id: sequenceId,
          chatbotId,
        },
      })

      const stepData = {
        order,
        delayDays,
        delayHours,
        delayUnit,
        specificDateTime: specificDateTime ? new Date(specificDateTime) : null,
        flowId,
        isActive,
        anytime,
        sendTimeStart,
        sendTimeEnd,
        sendDays: JSON.stringify(sendDays),
        sequenceId,
      }

      let step
      if (stepId) {
        // Update existing step
        step = await prisma.sequenceStep.update({
          where: { id: stepId },
          data: stepData,
        })
      } else {
        // Create new step
        step = await prisma.sequenceStep.create({
          data: stepData,
        })
      }

      revalidateCacheTags([`chatbots:${chatbotId}#sequences`])

      return { stepId: step.id }
    },
  )
