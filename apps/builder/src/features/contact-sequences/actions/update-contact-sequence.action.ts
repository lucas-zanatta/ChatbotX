"use server"

import { prisma } from "@aha.chat/database"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type UpdateContactSequenceRequest,
  updateContactSequenceRequest,
} from "../schemas/contact-sequence"
import { calculateNextRunAtBulk } from "../utils/calculate-next-run-at"

type PrismaTransaction = Parameters<
  Parameters<typeof prisma.$transaction>[0]
>[0]

async function getCurrentSequenceIds(contactId: string, tx: PrismaTransaction) {
  const sequences = await tx.contactsOnSequence.findMany({
    where: { contactId },
    select: { sequenceId: true },
  })
  return sequences.map((s) => s.sequenceId)
}

function calculateSequenceDiff(
  currentIds: string[],
  newIds: string[],
): { toAdd: string[]; toRemove: string[] } {
  const currentSet = new Set(currentIds)
  const newSet = new Set(newIds)

  return {
    toAdd: newIds.filter((id) => !currentSet.has(id)),
    toRemove: currentIds.filter((id) => !newSet.has(id)),
  }
}

async function removeContactSequences(
  contactId: string,
  sequenceIds: string[],
  tx: PrismaTransaction,
) {
  if (sequenceIds.length === 0) {
    return
  }

  await tx.contactsOnSequence.deleteMany({
    where: {
      contactId,
      sequenceId: { in: sequenceIds },
    },
  })
}

async function addContactSequences(
  contactId: string,
  sequenceIds: string[],
  chatbotId: string,
  tx: PrismaTransaction,
) {
  if (sequenceIds.length === 0) {
    return
  }

  const now = new Date()
  const nextRunAtMap = await calculateNextRunAtBulk(sequenceIds, now, tx)

  await tx.contactsOnSequence.createMany({
    data: sequenceIds.map((sequenceId) => {
      const result = nextRunAtMap.get(sequenceId) ?? {
        nextRunAt: now,
        nextStepId: null,
      }
      return {
        contactId,
        sequenceId,
        chatbotId,
        currentStep: 0,
        status: "active",
        nextRunAt: result.nextRunAt,
        nextStepId: result.nextStepId,
        enrolledAt: now,
      }
    }),
  })
}

export const updateContactSequenceAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(updateContactSequenceRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: UpdateContactSequenceRequest
    }) => {
      const contact = await prisma.contact.findFirstOrThrow({
        where: { id: parsedInput.contactId },
      })

      const returnedSequences = await prisma.$transaction(async (tx) => {
        const currentIds = await getCurrentSequenceIds(contact.id, tx)
        const { toAdd, toRemove } = calculateSequenceDiff(
          currentIds,
          parsedInput.sequences,
        )

        await removeContactSequences(contact.id, toRemove, tx)
        await addContactSequences(contact.id, toAdd, chatbotId, tx)

        return tx.contactsOnSequence.findMany({
          where: { contactId: contact.id },
          include: { sequence: true },
        })
      })

      revalidateCacheTags([
        `chatbots:${chatbotId}#contacts`,
        `chatbots:${chatbotId}#conversations`,
        `chatbots:${chatbotId}#sequences`,
      ])

      return returnedSequences
    },
  )
