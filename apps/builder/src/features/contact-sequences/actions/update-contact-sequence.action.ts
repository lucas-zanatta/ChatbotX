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
        const sequences = await tx.sequence.findMany({
          where: {
            name: {
              in: parsedInput.sequences,
            },
            chatbotId,
          },
        })

        await tx.contactsOnSequence.deleteMany({
          where: {
            contactId: contact.id,
          },
        })

        if (sequences.length > 0) {
          await tx.contactsOnSequence.createMany({
            data: sequences.map((s) => ({
              contactId: contact.id,
              sequenceId: s.id,
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
