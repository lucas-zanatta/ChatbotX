"use server"

import { Prisma, prisma } from "@aha.chat/database"
import { getTranslations } from "next-intl/server"
import { returnValidationErrors } from "next-safe-action"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type UpdateSequenceSchema,
  updateSequenceSchema,
} from "../schemas/update-sequence-schema"

export const updateSequenceAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .inputSchema(updateSequenceSchema)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId, id],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
      parsedInput: UpdateSequenceSchema
    }) => {
      const t = await getTranslations()

      const sequence = await prisma.sequence.findFirstOrThrow({
        where: {
          id,
          chatbotId,
        },
      })

      try {
        await prisma.sequence.update({
          where: {
            id: sequence.id,
          },
          data: parsedInput,
        })
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          return returnValidationErrors(updateSequenceSchema, {
            _errors: [t("sequences.validation.exception")],
            name: {
              _errors: [t("sequences.validation.nameExists")],
            },
          })
        }

        throw new Error("Failed to update sequence")
      }

      revalidateCacheTags([`chatbots:${chatbotId}#sequences`])
    },
  )
