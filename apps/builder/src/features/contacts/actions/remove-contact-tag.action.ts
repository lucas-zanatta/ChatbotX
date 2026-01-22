"use server"

import { prisma } from "@aha.chat/database"
import { emitTagRemoved } from "@aha.chat/events"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type RemoveContactTagRequest,
  removeContactTagRequest,
} from "../schemas/contact-tag"

export const removeContactTagAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(removeContactTagRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: RemoveContactTagRequest
    }) => {
      const contacts = await prisma.contact.findMany({
        where: {
          chatbotId,
          id: {
            in: parsedInput.ids,
          },
        },
        select: {
          id: true,
        },
      })
      if (contacts.length === 0) {
        return
      }

      const allTags = await prisma.$transaction(async (tx) => {
        const allTags = await tx.tag.findMany({
          where: {
            chatbotId,
            name: {
              in: parsedInput.tags,
            },
          },
          select: {
            id: true,
          },
        })

        for (const contact of contacts) {
          await tx.contact.update({
            data: {
              tags: {
                disconnect: allTags,
              },
            },
            where: {
              id: contact.id,
            },
          })
        }

        return allTags
      })

      for (const contact of contacts) {
        for (const tag of allTags) {
          try {
            await emitTagRemoved(chatbotId, contact.id, tag.id)
          } catch (error) {
            console.error("Failed to emit tagRemoved event:", error)
          }
        }
      }

      revalidateCacheTags([
        `chatbots:${chatbotId}#contacts`,
        `chatbots:${chatbotId}#conversations`,
        `chatbots:${chatbotId}#tags`,
      ])
    },
  )
