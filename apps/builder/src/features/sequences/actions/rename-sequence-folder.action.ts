"use server"

import { prisma } from "@aha.chat/database"
import { returnValidationErrors } from "next-safe-action"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type RenameSequenceFolderRequest,
  renameSequenceFolderRequest,
} from "../schemas/sequence-folder-schema"

export const renameSequenceFolderAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(renameSequenceFolderRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: RenameSequenceFolderRequest
    }) => {
      // Check if folder name already exists (excluding current folder)
      const existingFolder = await prisma.sequenceFolder.findFirst({
        select: {
          id: true,
        },
        where: {
          name: parsedInput.name,
          chatbotId,
          id: {
            not: parsedInput.folderId,
          },
        },
      })

      if (existingFolder) {
        return returnValidationErrors(renameSequenceFolderRequest, {
          _errors: ["Validation Exception"],
          name: {
            _errors: ["Folder name already exists"],
          },
        })
      }

      await prisma.sequenceFolder.update({
        where: {
          id: parsedInput.folderId,
          chatbotId,
        },
        data: {
          name: parsedInput.name,
        },
      })

      revalidateCacheTags([`chatbots:${chatbotId}#sequences`])

      return { success: true }
    },
  )
