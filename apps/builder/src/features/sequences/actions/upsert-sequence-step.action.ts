"use server"

import { type Prisma, prisma } from "@aha.chat/database"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { recalculateAllContactsInSequence } from "@/features/contact-sequences/utils/calculate-next-run-at"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type UpsertSequenceStepRequest,
  upsertSequenceStepRequest,
} from "../schemas/upsert-sequence-step-schema"

async function validateSequenceOwnership(
  sequenceId: string,
  chatbotId: string,
) {
  await prisma.sequence.findFirstOrThrow({
    where: {
      id: sequenceId,
      chatbotId,
    },
  })
}

function buildUpdateData(
  parsedInput: UpsertSequenceStepRequest,
): Prisma.SequenceStepUpdateInput {
  const {
    order,
    delayDays,
    delayMinutes,
    delayUnit,
    flowId,
    specificDateTime,
    isActive,
    anytime,
    sendTimeStart,
    sendTimeEnd,
    sendDays,
  } = parsedInput

  return {
    order,
    ...(delayDays !== undefined && { delayDays }),
    ...(delayMinutes !== undefined && { delayMinutes }),
    ...(delayUnit !== undefined && { delayUnit }),
    ...(flowId !== undefined && { flowId }),
    ...(specificDateTime !== undefined && {
      specificDateTime: specificDateTime ? new Date(specificDateTime) : null,
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
}

function buildCreateData(
  parsedInput: UpsertSequenceStepRequest,
  sequenceId: string,
): Prisma.SequenceStepCreateInput {
  const {
    order,
    delayDays,
    delayMinutes,
    delayUnit,
    flowId,
    specificDateTime,
    isActive,
    anytime,
    sendTimeStart,
    sendTimeEnd,
    sendDays,
  } = parsedInput

  return {
    order,
    delayDays: delayDays ?? 1,
    delayMinutes: delayMinutes ?? 0,
    delayUnit: delayUnit ?? "days",
    sequence: {
      connect: { id: sequenceId },
    },
    ...(flowId !== undefined && {
      flow: { connect: { id: flowId } },
    }),
    ...(specificDateTime !== undefined && {
      specificDateTime: specificDateTime ? new Date(specificDateTime) : null,
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
}

function shouldRecalculate(parsedInput: UpsertSequenceStepRequest): boolean {
  const { delayDays, delayMinutes, delayUnit, isActive, order } = parsedInput

  return (
    delayDays !== undefined ||
    delayMinutes !== undefined ||
    delayUnit !== undefined ||
    isActive !== undefined ||
    order !== undefined
  )
}

async function updateSequenceStep(
  stepId: string,
  updateData: Prisma.SequenceStepUpdateInput,
  chatbotId: string,
) {
  const step = await prisma.sequenceStep.findFirstOrThrow({
    where: { id: stepId },
    include: { sequence: true },
  })

  if (step.sequence.chatbotId !== chatbotId) {
    throw new Error("Unauthorized: Step does not belong to this chatbot")
  }

  return await prisma.sequenceStep.update({
    where: { id: stepId },
    data: updateData,
  })
}

async function createSequenceStep(createData: Prisma.SequenceStepCreateInput) {
  return await prisma.sequenceStep.create({
    data: createData,
  })
}

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
      const { stepId, sequenceId } = parsedInput

      await validateSequenceOwnership(sequenceId, chatbotId)

      let step:
        | Awaited<ReturnType<typeof prisma.sequenceStep.create>>
        | Awaited<ReturnType<typeof prisma.sequenceStep.update>>

      if (stepId) {
        const updateData = buildUpdateData(parsedInput)
        step = await updateSequenceStep(stepId, updateData, chatbotId)

        if (shouldRecalculate(parsedInput)) {
          await recalculateAllContactsInSequence(sequenceId, chatbotId)
        }
      } else {
        const createData = buildCreateData(parsedInput, sequenceId)
        step = await createSequenceStep(createData)

        await recalculateAllContactsInSequence(sequenceId, chatbotId)
      }

      revalidateCacheTags([`chatbots:${chatbotId}#sequences`])

      return { stepId: step.id }
    },
  )
