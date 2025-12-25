"use server"

import { type Prisma, prisma } from "@aha.chat/database"
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

      const baseData = {
        order,
        delayDays: delayDays ?? 0,
        delayMinutes: delayMinutes ?? 0,
        delayUnit: delayUnit ?? "days",
        ...(flowId !== undefined && { flowId }),
        ...(specificDateTime !== undefined && {
          specificDateTime: specificDateTime
            ? new Date(specificDateTime)
            : null,
        }),
        ...(isActive !== undefined && { isActive }),
        ...(anytime !== undefined && { anytime }),
        ...(sendTimeStart !== undefined && {
          sendTimeStart: sendTimeStart || null,
        }),
        ...(sendTimeEnd !== undefined && { sendTimeEnd: sendTimeEnd || null }),
        ...(sendDays !== undefined && {
          sendDays: sendDays ? JSON.stringify(sendDays) : null,
        }),
      }

      let step:
        | Awaited<ReturnType<typeof prisma.sequenceStep.create>>
        | Awaited<ReturnType<typeof prisma.sequenceStep.update>>
      if (stepId) {
        step = await prisma.sequenceStep.update({
          where: { id: stepId },
          data: baseData satisfies Prisma.SequenceStepUpdateInput,
        })
      } else {
        step = await prisma.sequenceStep.create({
          data: {
            ...baseData,
            sequenceId,
          } satisfies Prisma.SequenceStepUncheckedCreateInput,
        })
      }

      revalidateCacheTags([`chatbots:${chatbotId}#sequences`])

      return { stepId: step.id }
    },
  )
