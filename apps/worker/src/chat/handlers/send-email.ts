import { db } from "@chatbotx.io/database/client"
import { getPublicUrl } from "@chatbotx.io/database/utils"
import type { PageElementSchema } from "@chatbotx.io/flow-config"
import { smtpAuthSchema } from "@chatbotx.io/integration-smtp"
import type {
  DynamicEmailProps,
  MailElementSchema,
} from "@chatbotx.io/mail/render"
import {
  createSmtpTransporter,
  sendDynamicEmail,
} from "@chatbotx.io/mail/render"
import { contactVariableService } from "@chatbotx.io/variables"
import type { ChatJobSendEmail } from "@chatbotx.io/worker-config"
import type { InboxWithIntegrations } from "../../lib/convert-button"
import { resolveButtonUrl } from "../../lib/convert-button"
import { logger } from "../../lib/logger"

async function resolveElements({
  rawElements,
  variables,
  inbox,
  flowId,
}: {
  rawElements: PageElementSchema[]
  variables: Awaited<ReturnType<typeof contactVariableService.getAll>>
  inbox: InboxWithIntegrations | undefined
  flowId: string | undefined
}): Promise<MailElementSchema[]> {
  const resolved: MailElementSchema[] = []

  for (const el of rawElements) {
    switch (el.type) {
      case "Heading":
      case "Text":
      case "Code":
        resolved.push({
          type: el.type,
          text: await contactVariableService.replaceAll({
            text: el.text,
            variables,
          }),
        })
        break
      case "Image":
        resolved.push({
          type: "Image",
          url: el.url ? getPublicUrl(el.url) : undefined,
        })
        break
      case "Line":
      case "Spacing":
        resolved.push({ type: el.type })
        break
      case "Button": {
        const url = el.beforeStep
          ? resolveButtonUrl(el.beforeStep, inbox, flowId)
          : undefined
        const label =
          el.beforeStep && "label" in el.beforeStep
            ? (el.beforeStep.label ?? undefined)
            : undefined
        resolved.push({ type: "Button", url, label })
        break
      }
      default:
        break
    }
  }

  return resolved
}

export async function handleSendEmail({
  conversationId,
  flowId,
  step,
  contactInboxId,
  metadata: _metadata,
}: ChatJobSendEmail["data"]) {
  const conversation = await db.query.conversationModel.findFirst({
    where: { id: conversationId },
    with: { contact: true },
  })
  if (!conversation) {
    logger.warn(`handleSendEmail: conversation ${conversationId} not found`)
    return
  }

  const smtpIntegration = await db.query.integrationSmtpModel.findFirst({
    where: { id: step.integrationSmtpId },
  })
  if (!smtpIntegration) {
    logger.warn(
      `handleSendEmail: smtp integration ${step.integrationSmtpId} not found`,
    )
    return
  }

  const auth = smtpAuthSchema.parse({
    authType: "custom",
    ...(smtpIntegration.auth as Record<string, unknown>),
  })

  const [workspace, variables, contactInbox] = await Promise.all([
    db.query.workspaceModel.findFirst({
      where: { id: conversation.workspaceId },
    }),
    contactVariableService.getAll(conversation.contactId),
    contactInboxId
      ? db.query.contactInboxModel.findFirst({
          where: { id: contactInboxId },
          with: {
            inbox: {
              with: {
                integrationInstagram: true,
                integrationMessenger: true,
                integrationTelegram: true,
                integrationWebchat: true,
                integrationWhatsapp: true,
                integrationZalo: true,
              },
            },
          },
        })
      : Promise.resolve(null),
  ])

  const inbox = contactInbox?.inbox

  const [to, subject, preheader] = await Promise.all([
    contactVariableService.replaceAll({ text: step.to, variables }),
    contactVariableService.replaceAll({ text: step.subject, variables }),
    contactVariableService.replaceAll({ text: step.preheader, variables }),
  ])

  const elements = await resolveElements({
    rawElements: step.elements,
    variables,
    inbox,
    flowId,
  })

  const props: DynamicEmailProps = {
    brandName: workspace?.name ?? smtpIntegration.name,
    brandLogoUrl: workspace?.logo ? getPublicUrl(workspace.logo) : "",
    brandUrl: "",
    subject,
    preheader,
    elements,
  }

  const smtpTransporter = createSmtpTransporter({
    host: auth.host,
    port: auth.port,
    username: auth.username,
    password: auth.password,
  })

  await sendDynamicEmail(to, props, {
    from: step.from || auth.fromAddress,
    transporter: smtpTransporter,
  })
}
