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

      // Verify sequence belongs to chatbot
      await prisma.sequence.findFirstOrThrow({
        where: {
          id: sequenceId,
          chatbotId,
        },
      })

      const stepData: any = {
        order,
        sequenceId,
      }

      // Chỉ thêm các field được gửi lên (không undefined)
      if (flowId !== undefined) {
        stepData.flowId = flowId
      }
      if (delayDays !== undefined) {
        stepData.delayDays = delayDays
      }
      if (delayMinutes !== undefined) {
        stepData.delayMinutes = delayMinutes
      }
      if (delayUnit !== undefined) {
        stepData.delayUnit = delayUnit
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
