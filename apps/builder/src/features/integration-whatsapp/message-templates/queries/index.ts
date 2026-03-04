import { and, db, eq, findOrFail, inArray } from "@aha.chat/database/client"
import {
  integrationWhatsappModel,
  whatsappMessageTemplateModel,
} from "@aha.chat/database/schema"
import type { IntegrationWhatsappModel } from "@aha.chat/database/types"
import type { ListMessageTemplatesRequest } from "@/features/integration-whatsapp/message-templates/schemas/get-message-templates-schema"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { MessageTemplate, MessageTemplateWithComponents } from "../type"

export const getMessageTemplates = async (
  input: ListMessageTemplatesRequest,
): Promise<MessageTemplate[]> => {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  const integrationWhatsapp = await findOrFail<IntegrationWhatsappModel>(
    integrationWhatsappModel,
    {
      chatbotId: input.chatbotId,
      id: input.id,
    },
    "Whatsapp integration not found",
  )

  return await db
    .select({
      id: whatsappMessageTemplateModel.id,
      name: whatsappMessageTemplateModel.name,
      language: whatsappMessageTemplateModel.language,
      category: whatsappMessageTemplateModel.category,
      status: whatsappMessageTemplateModel.status,
    })
    .from(whatsappMessageTemplateModel)
    .where(
      eq(
        whatsappMessageTemplateModel.integrationWhatsappId,
        integrationWhatsapp.id,
      ),
    )
    .orderBy(whatsappMessageTemplateModel.createdAt)
}

export const getTemplatesForChatbot = async (
  chatbotId: string,
  status?: string,
): Promise<MessageTemplateWithComponents[]> => {
  await assertCurrentUserCanAccessChatbot(chatbotId)

  const integrations = await db
    .select({ id: integrationWhatsappModel.id })
    .from(integrationWhatsappModel)
    .where(eq(integrationWhatsappModel.chatbotId, chatbotId))

  if (integrations.length === 0) {
    return []
  }

  const integrationIds = integrations.map((i) => i.id)

  const baseCondition = inArray(
    whatsappMessageTemplateModel.integrationWhatsappId,
    integrationIds,
  )
  const whereExpr = status
    ? and(baseCondition, eq(whatsappMessageTemplateModel.status, status))
    : baseCondition

  const rows = await db
    .select({
      id: whatsappMessageTemplateModel.id,
      name: whatsappMessageTemplateModel.name,
      language: whatsappMessageTemplateModel.language,
      category: whatsappMessageTemplateModel.category,
      status: whatsappMessageTemplateModel.status,
      sourceId: whatsappMessageTemplateModel.sourceId,
    })
    .from(whatsappMessageTemplateModel)
    .where(whereExpr)
    .orderBy(whatsappMessageTemplateModel.name)

  return rows.map((r) => ({ ...r, components: [] as unknown }))
}
