"use server"

import { and, db, eq, findOrFail, notInArray } from "@aha.chat/database/client"
import {
  contactModel,
  contactsToTagsModel,
  tagModel,
} from "@aha.chat/database/schema"
import type { ContactModel } from "@aha.chat/database/types"
import { emitTagApplied, emitTagRemoved } from "@aha.chat/events"
import { createId } from "@paralleldrive/cuid2"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type UpdateContactTagRequest,
  updateContactTagRequest,
} from "../schemas/contact-tag"

// Note: TagResource type removed as function now returns custom object with addedTags/removedTagIds

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
      const result = await updateContactTags({ chatbotId, parsedInput })

      // Emit events for tag changes
      for (const tag of result.addedTags) {
        try {
          await emitTagApplied(chatbotId, parsedInput.contactId, tag.id)
        } catch (error) {
          console.error("Failed to emit tagApplied event:", error)
        }
      }

      for (const tagId of result.removedTagIds) {
        try {
          await emitTagRemoved(chatbotId, parsedInput.contactId, tagId)
        } catch (error) {
          console.error("Failed to emit tagRemoved event:", error)
        }
      }

      return result.tags
    },
  )

export const updateContactTags = async ({
  chatbotId,
  parsedInput,
}: {
  chatbotId: string
  parsedInput: UpdateContactTagRequest
}) => {
  const contact = await findOrFail<ContactModel>(
    contactModel,
    {
      id: parsedInput.contactId,
      chatbotId,
    },
    "Contact not found",
  )

  // Get existing tags for this contact
  const existingContactTags = await db.query.contactsToTagsModel.findMany({
    where: {
      contactId: contact.id,
    },
    columns: {
      tagId: true,
    },
  })
  const oldTagIds = new Set(existingContactTags.map((ct) => ct.tagId))

  const returnedTags = await db.transaction(async (tx) => {
    if (parsedInput.tags.length > 0) {
      await tx
        .insert(tagModel)
        .values(
          parsedInput.tags.map((name) => ({
            id: createId(),
            name,
            chatbotId,
          })),
        )
        .onConflictDoNothing({
          target: [tagModel.chatbotId, tagModel.name],
        })
    }

    const tags = await tx.query.tagModel.findMany({
      where: {
        chatbotId,
        name: { in: parsedInput.tags },
      },
    })

    if (tags.length > 0) {
      await tx
        .insert(contactsToTagsModel)
        .values(
          tags.map((selectedTag) => ({
            contactId: contact.id,
            tagId: selectedTag.id,
          })),
        )
        .onConflictDoNothing({
          target: [contactsToTagsModel.contactId, contactsToTagsModel.tagId],
        })

      await tx.delete(contactsToTagsModel).where(
        and(
          eq(contactsToTagsModel.contactId, contact.id),
          notInArray(
            contactsToTagsModel.tagId,
            tags.map((t) => t.id),
          ),
        ),
      )
    }

    return tags
  })

  // Calculate added and removed tags
  const newTagIds = new Set(returnedTags.map((t) => t.id))
  const addedTags = returnedTags.filter((tag) => !oldTagIds.has(tag.id))
  const removedTagIds = Array.from(oldTagIds).filter((id) => !newTagIds.has(id))

  revalidateCacheTags([
    `chatbots:${chatbotId}#contacts`,
    `chatbots:${chatbotId}#conversations`,
    `chatbots:${chatbotId}#tags`,
  ])

  return { tags: returnedTags, addedTags, removedTagIds }
}
