"use server"

import { prisma } from "@aha.chat/database"
import { z } from "zod"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import { updateFolderSequenceCounts } from "../queries/update-folder-counts"

const moveSequenceToFoldersSchema = z.object({
  sequenceId: z.string(),
  folderIds: z.array(z.string()).max(1, "A sequence can only be in one folder"),
})

type MoveSequenceToFoldersRequest = z.infer<typeof moveSequenceToFoldersSchema>

const bulkMoveSequencesToFoldersSchema = z.object({
  sequenceIds: z.array(z.string()).min(1, "At least one sequence is required"),
  folderIds: z.array(z.string()).max(1, "A sequence can only be in one folder"),
})

type BulkMoveSequencesToFoldersRequest = z.infer<
  typeof bulkMoveSequencesToFoldersSchema
>

export const moveSequenceToFoldersAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(moveSequenceToFoldersSchema)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: MoveSequenceToFoldersRequest
    }) => {
      const { sequenceId, folderIds } = parsedInput

      // Get old folder IDs before deletion
      const oldFolders = await prisma.sequencesOnFolders.findMany({
        where: { sequenceId },
        select: { folderId: true },
      })
      const oldFolderIds = oldFolders.map((f) => f.folderId)

      // Delete all existing folder associations
      await prisma.sequencesOnFolders.deleteMany({
        where: {
          sequenceId,
        },
      })

      // Create new folder associations
      if (folderIds.length > 0) {
        await prisma.sequencesOnFolders.createMany({
          data: folderIds.map((folderId) => ({
            sequenceId,
            folderId,
          })),
        })
      }

      // Update counts for affected folders (old and new)
      const affectedFolderIds = [...new Set([...oldFolderIds, ...folderIds])]
      await Promise.all(
        affectedFolderIds.map((folderId) =>
          updateFolderSequenceCounts(folderId),
        ),
      )

      revalidateCacheTags([`chatbots:${chatbotId}#sequences`])

      return { success: true }
    },
  )

export const bulkMoveSequencesToFoldersAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(bulkMoveSequencesToFoldersSchema)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: BulkMoveSequencesToFoldersRequest
    }) => {
      const { sequenceIds, folderIds } = parsedInput

      // Get all existing folder associations for the sequences
      const existingAssociations = await prisma.sequencesOnFolders.findMany({
        where: {
          sequenceId: { in: sequenceIds },
        },
        select: { sequenceId: true, folderId: true },
      })
      const oldFolderIds = [
        ...new Set(existingAssociations.map((a) => a.folderId)),
      ]

      // Delete all existing folder associations for all sequences
      await prisma.sequencesOnFolders.deleteMany({
        where: {
          sequenceId: { in: sequenceIds },
        },
      })

      // Create new folder associations for all sequences
      if (folderIds.length > 0) {
        await prisma.sequencesOnFolders.createMany({
          data: sequenceIds.flatMap((sequenceId) =>
            folderIds.map((folderId) => ({
              sequenceId,
              folderId,
            })),
          ),
          skipDuplicates: true,
        })
      }

      // Update counts for affected folders (old and new)
      const affectedFolderIds = [...new Set([...oldFolderIds, ...folderIds])]
      await Promise.all(
        affectedFolderIds.map((folderId) =>
          updateFolderSequenceCounts(folderId),
        ),
      )

      revalidateCacheTags([`chatbots:${chatbotId}#sequences`])

      return { success: true, movedCount: sequenceIds.length }
    },
  )
