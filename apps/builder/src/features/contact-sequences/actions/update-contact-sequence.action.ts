"use server"

import { prisma } from "@aha.chat/database"
import {
  cancelPendingDispatches,
  enrollContactInSequence,
} from "@aha.chat/sequence-scheduler"
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

async function getCurrentSequenceIds(
  contactId: string,
  chatbotId: string,
  tx: PrismaTransaction,
) {
  const sequences = await tx.contactsOnSequence.findMany({
    where: { contactId, chatbotId },
    select: { sequenceId: true },
  })
  return sequences.map((s: { sequenceId: string }) => s.sequenceId)
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
  chatbotId: string,
  tx: PrismaTransaction,
) {
  if (sequenceIds.length === 0) {
    return
  }

  const enrollments = await tx.contactsOnSequence.findMany({
    where: {
      contactId,
      sequenceId: { in: sequenceIds },
      chatbotId,
    },
    select: {
      id: true,
    },
  })

  await Promise.all(
    enrollments.map((enrollment: { id: string }) =>
      cancelPendingDispatches({
        enrollmentId: enrollment.id,
        chatbotId,
        reason: "enrollment_removed",
        client: tx,
      }),
    ),
  )

  await tx.contactsOnSequence.deleteMany({
    where: {
      id: { in: enrollments.map((e: { id: string }) => e.id) },
      chatbotId,
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

  for (const sequenceId of sequenceIds) {
    const result = nextRunAtMap.get(sequenceId) ?? {
      nextRunAt: now,
      nextStepId: null,
    }

    await enrollContactInSequence({
      chatbotId,
      contactId,
      sequenceId,
      nextRunAt: result.nextRunAt,
      nextStepId: result.nextStepId,
      enrolledAt: now,
      client: tx,
    })
  }
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
        where: { id: parsedInput.contactId, chatbotId },
      })

      const returnedSequences = await prisma.$transaction(async (tx) => {
        const currentIds = await getCurrentSequenceIds(
          contact.id,
          chatbotId,
          tx,
        )
        const { toAdd, toRemove } = calculateSequenceDiff(
          currentIds,
          parsedInput.sequences,
        )

        await removeContactSequences(contact.id, toRemove, chatbotId, tx)
        await addContactSequences(contact.id, toAdd, chatbotId, tx)

        return tx.contactsOnSequence.findMany({
          where: { contactId: contact.id, chatbotId },
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
