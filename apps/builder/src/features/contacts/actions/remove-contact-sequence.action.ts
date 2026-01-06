"use server"

import { prisma } from "@aha.chat/database"
import { cancelPendingDispatches } from "@aha.chat/sequence-scheduler"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type RemoveContactSequenceRequest,
  removeContactSequenceRequest,
} from "../schemas/contact-sequence"

const CHUNK_SIZE = 1000

export const removeContactSequenceAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(removeContactSequenceRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: RemoveContactSequenceRequest
    }) => {
      for (let i = 0; i < parsedInput.ids.length; i += CHUNK_SIZE) {
        const contactIdChunk = parsedInput.ids.slice(i, i + CHUNK_SIZE)

        const enrollments = await prisma.contactsOnSequence.findMany({
          where: {
            contactId: { in: contactIdChunk },
            sequenceId: { in: parsedInput.sequences },
            chatbotId,
          },
          select: {
            id: true,
          },
        })

        await Promise.all(
          enrollments.map((enrollment) =>
            cancelPendingDispatches({
              enrollmentId: enrollment.id,
              chatbotId,
              reason: "enrollment_removed",
            }),
          ),
        )

        await prisma.contactsOnSequence.deleteMany({
          where: {
            id: { in: enrollments.map((e) => e.id) },
            chatbotId,
          },
        })
      }

      revalidateCacheTags([
        `chatbots:${chatbotId}#contacts`,
        `chatbots:${chatbotId}#sequences`,
      ])
    },
  )
