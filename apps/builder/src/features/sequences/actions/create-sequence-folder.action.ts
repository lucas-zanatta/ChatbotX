"use server"

import { Prisma, prisma } from "@aha.chat/database"
import { returnValidationErrors } from "next-safe-action"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import { MAX_FOLDER_DEPTH } from "../constants/folder-constants"
import {
  type CreateSequenceFolderRequest,
  createSequenceFolderRequest,
} from "../schemas/sequence-folder-schema"

export const createSequenceFolderAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(createSequenceFolderRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: CreateSequenceFolderRequest
    }) => {
      console.log("[Action] Creating folder:", {
        chatbotId,
        parsedInput,
      })

      let depth = 1
      let position = 0

      if (parsedInput.parentId) {
        const parent = await prisma.sequenceFolder.findUnique({
          where: { id: parsedInput.parentId },
          select: { depth: true },
        })

        if (parent) {
          depth = parent.depth + 1

          if (depth > MAX_FOLDER_DEPTH) {
            return returnValidationErrors(createSequenceFolderRequest, {
              _errors: [
                `Maximum folder depth (${MAX_FOLDER_DEPTH} levels) exceeded`,
              ],
            })
          }
        }
      }

      try {
        const lastFolder = await prisma.sequenceFolder.findFirst({
          where: {
            chatbotId,
            parentId: parsedInput.parentId ?? null,
          },
          orderBy: { position: "desc" },
          select: { position: true },
        })

        if (lastFolder) {
          position = lastFolder.position + 1
        }

        const folder = await prisma.sequenceFolder.create({
          data: {
            name: parsedInput.name,
            chatbotId,
            parentId: parsedInput.parentId ?? null,
            depth,
            position,
          },
        })

        revalidateCacheTags([`chatbots:${chatbotId}#sequences`])

        return { folderId: folder.id }
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          return returnValidationErrors(createSequenceFolderRequest, {
            _errors: ["Validation Exception"],
            name: {
              _errors: ["Folder name already exists"],
            },
          })
        }

        throw new Error("Failed to create folder")
      }
    },
  )
