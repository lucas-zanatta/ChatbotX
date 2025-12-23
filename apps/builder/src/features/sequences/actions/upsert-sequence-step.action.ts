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
        delayMinutes,
        delayUnit,
        specificDateTime,
        flowId,
        isActive,
        anytime,
        sendTimeStart,
        sendTimeEnd,
        sendDays,
      } = parsedInput

      await prisma.sequence.findFirstOrThrow({
        where: {
          id: sequenceId,
          chatbotId,
        },
      })

      const stepData: Record<string, any> = {
        order,
        sequenceId,
        delayDays: delayDays ?? 0,
        delayMinutes: delayMinutes ?? 0,
        delayUnit: delayUnit ?? "days",
      }

      if (flowId !== undefined) {
        stepData.flowId = flowId
      }
      if (specificDateTime !== undefined) {
        stepData.specificDateTime = specificDateTime
          ? new Date(specificDateTime)
          : null
      }
      if (isActive !== undefined) {
        stepData.isActive = isActive
      }
      if (anytime !== undefined) {
        stepData.anytime = anytime
      }
      if (sendTimeStart !== undefined) {
        stepData.sendTimeStart = sendTimeStart || null
      }
      if (sendTimeEnd !== undefined) {
        stepData.sendTimeEnd = sendTimeEnd || null
      }
      if (sendDays !== undefined) {
        stepData.sendDays = sendDays ? JSON.stringify(sendDays) : null
      }

      let step:
        | Awaited<ReturnType<typeof prisma.sequenceStep.create>>
        | Awaited<ReturnType<typeof prisma.sequenceStep.update>>
      if (stepId) {
        step = await prisma.sequenceStep.update({
          where: { id: stepId },
          data: stepData as any,
        })
      } else {
        step = await prisma.sequenceStep.create({
          data: stepData as any,
        })
      }

      revalidateCacheTags([`chatbots:${chatbotId}#sequences`])

      return { stepId: step.id }
    },
  )
