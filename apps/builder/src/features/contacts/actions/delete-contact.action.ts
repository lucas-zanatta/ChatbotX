"use server"

import { contactTrackingService } from "@aha.chat/analytics"
import { prisma } from "@aha.chat/database"
import {
  type BulkUpdateIdsRequest,
  bulkUpdateIdsRequest,
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"

export const deleteContactAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(bulkUpdateIdsRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: BulkUpdateIdsRequest
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
          sourceId: true,
          source: true,
          updatedAt: true,
        },
      })
      await prisma.$transaction(async (tx) => {
        await tx.contact.deleteMany({
          where: {
            chatbotId,
            id: {
              in: parsedInput.ids,
            },
          },
        })
      })

      const events = contacts
        .filter((contact) => Boolean(contact.sourceId))
        .map((contact) => ({
          chatbotId,
          contactId: contact.sourceId as string,
          eventType: "contact_deleted" as const,
          occurredAt: contact.updatedAt,
          source: contact.source,
          sourceId: contact.sourceId as string,
        }))

      contactTrackingService.trackEvents(events).catch((error) => {
        console.error(
          "[deleteContactAction] Failed to track contact_deleted events",
          error,
        )
      })

      revalidateCacheTags(`chatbots:${chatbotId}#contacts`)
    },
  )
