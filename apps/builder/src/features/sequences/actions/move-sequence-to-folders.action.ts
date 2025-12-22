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
