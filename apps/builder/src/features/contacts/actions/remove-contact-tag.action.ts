"use server"

import { and, db, eq, inArray } from "@aha.chat/database/client"
import { contactsToTagsModel } from "@aha.chat/database/schema"
import { emitTagRemoved } from "@aha.chat/events"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type RemoveContactTagsRequest,
  removeContactTagsRequest,
} from "../schemas/contact-tag"

export const removeContactTagAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(removeContactTagsRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: RemoveContactTagsRequest
    }) => {
      const result = await removeContactTags({
        chatbotId,
        parsedInput,
      })

      if (result) {
        for (const contact of result.contacts) {
          for (const tag of result.tags) {
            try {
              await emitTagRemoved(chatbotId, contact.id, tag.id)
            } catch (error) {
              console.error("Failed to emit tagRemoved event:", error)
            }
          }
        }
      }
    },
  )

export const removeContactTags = async ({
  chatbotId,
  parsedInput,
}: {
  chatbotId: string
  parsedInput: RemoveContactTagsRequest
}) => {
  const contacts = await db.query.contactModel.findMany({
    where: {
      chatbotId,
      id: {
        in: parsedInput.ids,
      },
    },
    columns: {
      id: true,
    },
  })

  if (contacts.length === 0) {
    return null
  }

  const allTags = await db.transaction(async (tx) => {
    const allTags = await tx.query.tagModel.findMany({
      where: {
        chatbotId,
        OR: [
          {
            name: {
              in: parsedInput.tags,
            },
          },
          {
            id: {
              in: parsedInput.tags,
            },
          },
        ],
      },
      columns: {
        id: true,
      },
    })

    const allTagIds = allTags.map((tag) => tag.id)

    for (const contact of contacts) {
      await tx
        .delete(contactsToTagsModel)
        .where(
          and(
            eq(contactsToTagsModel.contactId, contact.id),
            inArray(contactsToTagsModel.tagId, allTagIds),
          ),
        )
    }

    return allTags
  })

  revalidateCacheTags([
    `chatbots:${chatbotId}#contacts`,
    `chatbots:${chatbotId}#conversations`,
    `chatbots:${chatbotId}#tags`,
  ])

  return { contacts, tags: allTags }
}
