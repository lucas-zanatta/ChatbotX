"use server"

import { prisma } from "@aha.chat/database"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type DeleteSequenceFolderRequest,
  deleteSequenceFolderRequest,
} from "../schemas/sequence-folder-schema"

export const deleteSequenceFolderAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(deleteSequenceFolderRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: DeleteSequenceFolderRequest
    }) => {
      await prisma.sequenceFolder.delete({
        where: {
          id: parsedInput.folderId,
          chatbotId,
        },
      })

      revalidateCacheTags([`chatbots:${chatbotId}#sequences`])

      return { success: true }
    },
  )
