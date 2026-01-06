"use server"

import { Prisma, prisma } from "@aha.chat/database"
import { getTranslations } from "next-intl/server"
import { returnValidationErrors } from "next-safe-action"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type CreateSequenceRequest,
  createSequenceRequest,
} from "../schemas/create-sequence-schema"

export const createSequenceAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(createSequenceRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: CreateSequenceRequest
    }) => {
      const t = await getTranslations()

      try {
        const sequence = await prisma.sequence.create({
          data: {
            chatbotId,
            name: parsedInput.name,
            ...(parsedInput.folderId && {
              sequencesOnFolders: {
                create: {
                  folderId: parsedInput.folderId,
                },
              },
            }),
          },
        })

        revalidateCacheTags([`chatbots:${chatbotId}#sequences`])

        return { sequenceId: sequence.id }
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          return returnValidationErrors(createSequenceRequest, {
            _errors: [t("sequences.validation.exception")],
            name: {
              _errors: [t("sequences.validation.nameExists")],
            },
          })
        }

        throw new Error("Failed to create sequence")
      }
    },
  )
