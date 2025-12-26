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
        where: {
          id: parsedInput.contactId,
        },
      })

      const returnedSequences = await prisma.$transaction(async (tx) => {
        // Get current sequences for this contact
        const currentContactSequences = await tx.contactsOnSequence.findMany({
          where: {
            contactId: contact.id,
          },
          select: {
            sequenceId: true,
          },
        })

        const currentSequenceIds = new Set(
          currentContactSequences.map((cos) => cos.sequenceId),
        )
        const newSequenceIds = new Set(parsedInput.sequences)

        const sequencesToAdd = parsedInput.sequences.filter(
          (id) => !currentSequenceIds.has(id),
        )

        const sequencesToRemove = currentContactSequences
          .map((cos) => cos.sequenceId)
          .filter((id) => !newSequenceIds.has(id))

        if (sequencesToRemove.length > 0) {
          await tx.contactsOnSequence.deleteMany({
            where: {
              contactId: contact.id,
              sequenceId: {
                in: sequencesToRemove,
              },
            },
          })
        }

        if (sequencesToAdd.length > 0) {
          await tx.contactsOnSequence.createMany({
            data: sequencesToAdd.map((sequenceId) => ({
              contactId: contact.id,
              sequenceId,
              chatbotId,
            })),
          })
        }

        return tx.contactsOnSequence.findMany({
          where: {
            contactId: contact.id,
          },
          include: {
            sequence: true,
          },
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
