import { prisma } from "@aha.chat/database"
import { FieldType } from "@aha.chat/database/types"
import { emitCustomFieldChanged } from "@aha.chat/events"
import {
  type CountCharactersStepSchema,
  type FormatDateStepSchema,
  type GenerateCodeStepSchema,
  GenerateCodeType,
  type GetDataFromJsonStepSchema,
} from "@aha.chat/flow-config"
import { faker } from "@faker-js/faker"
import { format } from "date-fns"
import { getProperty } from "dot-prop"
import type { FlowStepProps } from "./step-handler"

export async function countCharacters({
  conversation,
  step,
}: FlowStepProps<CountCharactersStepSchema>) {
  const customFieldIds = [step.inputCfId, step.outputCfId]
  const customFieldsCount = await prisma.field.count({
    where: {
      fieldType: FieldType.customField,
      id: {
        in: customFieldIds,
      },
    },
  })
  if (customFieldsCount !== 2) {
    return
  }

  // Find target contact custom field
  const targetContactCustomField = await prisma.contactCustomField.findFirst({
    where: {
      customFieldId: step.inputCfId,
    },
  })
  if (!targetContactCustomField) {
    return
  }

  const value = `${`${targetContactCustomField.value}`.length}`

  const existing = await prisma.contactCustomField.findUnique({
    where: {
      contactId_customFieldId: {
        contactId: conversation.contactId,
        customFieldId: step.outputCfId,
      },
    },
  })

  await prisma.contactCustomField.upsert({
    where: {
      contactId_customFieldId: {
        contactId: conversation.contactId,
        customFieldId: step.outputCfId,
      },
    },
    update: {
      value,
    },
    create: {
      value,
      contactId: conversation.contactId,
      customFieldId: step.outputCfId,
    },
  })

  const customField = await prisma.field.findUnique({
    where: { id: step.outputCfId },
    select: { name: true },
  })

  try {
    await emitCustomFieldChanged(
      conversation.chatbotId,
      conversation.contactId,
      step.outputCfId,
      customField?.name || step.outputCfId,
      existing?.value || null,
      value,
    )
  } catch (error) {
    console.error("Failed to emit customFieldChanged event:", error)
  }
}

export async function formatDate({
  conversation,
  step,
}: FlowStepProps<FormatDateStepSchema>) {
  const inputContactCustomField = await prisma.contactCustomField.findFirst({
    where: {
      customFieldId: step.inputCfId,
      contactId: conversation.contactId,
    },
  })
  if (!inputContactCustomField) {
    return
  }

  const newValue = format(new Date(inputContactCustomField.value), step.format)

  const existing = await prisma.contactCustomField.findUnique({
    where: {
      contactId_customFieldId: {
        contactId: conversation.contactId,
        customFieldId: step.outputCfId,
      },
    },
  })

  await prisma.contactCustomField.upsert({
    where: {
      contactId_customFieldId: {
        contactId: conversation.contactId,
        customFieldId: step.outputCfId,
      },
    },
    update: {
      value: newValue,
    },
    create: {
      contactId: conversation.contactId,
      customFieldId: step.outputCfId,
      value: newValue,
    },
  })

  const customField = await prisma.field.findUnique({
    where: { id: step.outputCfId },
    select: { name: true },
  })

  try {
    await emitCustomFieldChanged(
      conversation.chatbotId,
      conversation.contactId,
      step.outputCfId,
      customField?.name || step.outputCfId,
      existing?.value || null,
      newValue,
    )
  } catch (error) {
    console.error("Failed to emit customFieldChanged event:", error)
  }
}

export async function generateCode({
  conversation,
  step,
}: FlowStepProps<GenerateCodeStepSchema>) {
  let value: string | null = null
  switch (step.type) {
    case GenerateCodeType.NUMERIC_LENGTH: {
      const min = 10 ** (step.min - 1)
      const max = 10 ** step.max - 1
      value = `${faker.number.int({ min, max })}`
      break
    }
    case GenerateCodeType.NUMERIC_VALUE: {
      value = `${faker.number.int({ min: step.min, max: step.max })}`
      break
    }
    case GenerateCodeType.ALPHANUMERIC_LENGTH: {
      value = faker.string.alpha({ length: { min: step.min, max: step.max } })
      break
    }
    default:
      break
  }

  if (value) {
    const existing = await prisma.contactCustomField.findUnique({
      where: {
        contactId_customFieldId: {
          contactId: conversation.contactId,
          customFieldId: step.outputCfId,
        },
      },
    })

    await prisma.contactCustomField.upsert({
      where: {
        contactId_customFieldId: {
          contactId: conversation.contactId,
          customFieldId: step.outputCfId,
        },
      },
      update: {
        value,
      },
      create: {
        contactId: conversation.contactId,
        customFieldId: step.outputCfId,
        value,
      },
    })

    const customField = await prisma.field.findUnique({
      where: { id: step.outputCfId },
      select: { name: true },
    })

    try {
      await emitCustomFieldChanged(
        conversation.chatbotId,
        conversation.contactId,
        step.outputCfId,
        customField?.name || step.outputCfId,
        existing?.value || null,
        value,
      )
    } catch (error) {
      console.error("Failed to emit customFieldChanged event:", error)
    }
  }
}

export async function getDataFromJSON({
  conversation,
  step,
}: FlowStepProps<GetDataFromJsonStepSchema>) {
  const inputValue = await prisma.contactCustomField.findFirst({
    where: {
      contactId: conversation.contactId,
      customFieldId: step.inputCfId,
    },
  })
  if (!inputValue) {
    return
  }

  const dataJSON = JSON.parse(inputValue.value)
  const mapping = step.mapping as {
    jsonPath: string
    outputCfId: string
  }[]

  // Find valid custom fields
  const validCustomFields = await prisma.field.findMany({
    where: {
      fieldType: FieldType.customField,
      chatbotId: conversation.chatbotId,
      id: {
        in: mapping.map((m) => m.outputCfId),
      },
    },
    select: {
      id: true,
      name: true,
    },
  })
  const validCustomFieldIds = validCustomFields.map((v) => v.id)
  const customFieldMap = new Map(validCustomFields.map((f) => [f.id, f.name]))

  const updatedFields = await prisma.$transaction(async (tx) => {
    const updated: Array<{
      customFieldId: string
      customFieldName: string
      oldValue: string | null
      newValue: string
    }> = []

    for (const data of mapping) {
      if (validCustomFieldIds.includes(data.outputCfId)) {
        const value = getProperty(dataJSON, data.jsonPath)

        if (value) {
          const encodedValue = JSON.stringify(value)

          const existing = await tx.contactCustomField.findUnique({
            where: {
              contactId_customFieldId: {
                contactId: conversation.contactId,
                customFieldId: data.outputCfId,
              },
            },
          })

          await tx.contactCustomField.upsert({
            where: {
              contactId_customFieldId: {
                contactId: conversation.contactId,
                customFieldId: data.outputCfId,
              },
            },
            update: {
              value: encodedValue,
            },
            create: {
              contactId: conversation.contactId,
              customFieldId: data.outputCfId,
              value: encodedValue,
            },
          })

          updated.push({
            customFieldId: data.outputCfId,
            customFieldName:
              customFieldMap.get(data.outputCfId) || data.outputCfId,
            oldValue: existing?.value || null,
            newValue: encodedValue,
          })
        }
      }
    }

    return updated
  })

  for (const field of updatedFields) {
    try {
      await emitCustomFieldChanged(
        conversation.chatbotId,
        conversation.contactId,
        field.customFieldId,
        field.customFieldName,
        field.oldValue,
        field.newValue,
      )
    } catch (error) {
      console.error("Failed to emit customFieldChanged event:", error)
    }
  }
}
