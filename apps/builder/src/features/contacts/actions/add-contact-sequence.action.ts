"use server"

import { prisma } from "@aha.chat/database"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { calculateNextRunAtBulk } from "@/features/contact-sequences/utils/calculate-next-run-at"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type AddContactSequenceRequest,
  addContactSequenceRequest,
} from "../schemas/contact-sequence"

const CHUNK_SIZE = 1000

export const addContactSequenceAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(addContactSequenceRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: AddContactSequenceRequest
    }) => {
      // Calculate nextRunAt for all sequences in bulk
      const now = new Date()
      const nextRunAtMap = await calculateNextRunAtBulk(
        parsedInput.sequences,
        now,
      )

      // Process contacts in chunks to avoid memory issues
      for (let i = 0; i < parsedInput.ids.length; i += CHUNK_SIZE) {
        const contactIdChunk = parsedInput.ids.slice(i, i + CHUNK_SIZE)

        const contacts = await prisma.contact.findMany({
          where: {
            chatbotId,
            id: {
              in: contactIdChunk,
            },
          },
          select: {
            id: true,
          },
        })

        if (contacts.length === 0) {
          continue
        }

        // Create all combinations of contactId x sequenceId for this chunk
        const records = contacts.flatMap((contact) =>
          parsedInput.sequences.map((sequenceId) => {
            const result = nextRunAtMap.get(sequenceId) ?? {
              nextRunAt: now,
              nextStepId: null,
            }
            return {
              contactId: contact.id,
              sequenceId,
              chatbotId,
              currentStep: 0,
              status: "active",
              nextRunAt: result.nextRunAt,
              nextStepId: result.nextStepId,
              enrolledAt: now,
            }
          }),
        )

        await prisma.contactsOnSequence.createMany({
          data: records,
          skipDuplicates: true,
        })
      }

      revalidateCacheTags([
        `chatbots:${chatbotId}#contacts`,
        `chatbots:${chatbotId}#sequences`,
      ])
    },
  )
