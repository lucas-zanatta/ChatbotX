"use server"

import { prisma } from "@aha.chat/database"
import { emitTagApplied, emitTagRemoved } from "@aha.chat/events"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  findOrCreateTags,
  type Tag,
} from "../queries/find-or-create-tags.query"
import {
  type UpdateContactTagRequest,
  updateContactTagRequest,
} from "../schemas/contact-tag"

async function emitTagEvents(
  chatbotId: string,
  contactId: string,
  oldTagIds: Set<string>,
  newTags: Tag[],
) {
  const newTagIds = new Set(newTags.map((t) => t.id))
  const newlyAppliedTags = newTags.filter((tag) => !oldTagIds.has(tag.id))
  const removedTagIds = Array.from(oldTagIds).filter((id) => !newTagIds.has(id))

  for (const tag of newlyAppliedTags) {
    try {
      await emitTagApplied(chatbotId, contactId, tag.id)
    } catch (error) {
      console.error("Failed to emit tagApplied event:", error)
    }
  }

  for (const tagId of removedTagIds) {
    try {
      await emitTagRemoved(chatbotId, contactId, tagId)
    } catch (error) {
      console.error("Failed to emit tagRemoved event:", error)
    }
  }
}

async function addTagsToContact(
  contactId: string,
  chatbotId: string,
  tagNames: string[],
) {
  const contact = await prisma.contact.findFirstOrThrow({
    where: {
      id: contactId,
    },
    include: {
      tags: {
        select: {
          id: true,
        },
      },
    },
  })

  const oldTagIds = new Set(contact.tags.map((t) => t.id))

  const tags = await prisma.$transaction(async (tx) => {
    const { allTags: tags } = await findOrCreateTags(tx, chatbotId, tagNames)

    await tx.contact.update({
      data: {
        tags: {
          set: tags.map((t) => ({ id: t.id })),
        },
      },
      where: {
        id: contact.id,
      },
    })

    return tags
  })

  await emitTagEvents(chatbotId, contactId, oldTagIds, tags)

  return tags
}

export const updateContactTagAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(updateContactTagRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: UpdateContactTagRequest
    }) => {
      const tags = await addTagsToContact(
        parsedInput.contactId,
        chatbotId,
        parsedInput.tags,
      )

      revalidateCacheTags([
        `chatbots:${chatbotId}#contacts`,
        `chatbots:${chatbotId}#conversations`,
        `chatbots:${chatbotId}#tags`,
      ])

      return tags
    },
  )
