import { prisma } from "@aha.chat/database"
import type { ListMessageTemplatesRequest } from "@/features/integration-whatsapp/message-templates/schemas/get-message-templates-schema"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { MessageTemplate, MessageTemplateWithComponents } from "../type"

export const getMessageTemplates = async (
  input: ListMessageTemplatesRequest,
): Promise<MessageTemplate[]> => {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  const integrationWhatsapp =
    await prisma.integrationWhatsapp.findUniqueOrThrow({
      where: {
        chatbotId: input.chatbotId,
        id: input.id,
      },
    })

  return await prisma.whatsappMessageTemplate.findMany({
    where: {
      integrationWhatsappId: integrationWhatsapp.id,
    },
    select: {
      id: true,
      name: true,
      language: true,
      category: true,
      status: true,
    },
    orderBy: { createdAt: "asc" },
  })
}

export const getTemplatesForChatbot = async (
  chatbotId: string,
  status?: string,
): Promise<MessageTemplateWithComponents[]> => {
  await assertCurrentUserCanAccessChatbot(chatbotId)

  const filter: {
    integrationWhatsapp: { chatbotId: string }
    status?: string
  } = {
    integrationWhatsapp: { chatbotId },
  }

  if (status) {
    filter.status = status
  }

  return await prisma.whatsappMessageTemplate.findMany({
    where: filter,
    select: {
      id: true,
      name: true,
      language: true,
      category: true,
      status: true,
      components: true,
      sourceId: true,
    },
    orderBy: { name: "asc" },
  })
}
