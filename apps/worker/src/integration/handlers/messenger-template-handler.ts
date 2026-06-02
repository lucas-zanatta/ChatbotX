import { db } from "@chatbotx.io/database/client"
import type {
  MessengerTemplateParams,
  SendMessengerTemplateMessageStepSchema,
} from "@chatbotx.io/flow-config"
import {
  contactVariableService,
  type ReplaceVariableProps,
} from "@chatbotx.io/variables"

export async function replaceMessengerTemplateVariables(props: {
  templateParams: MessengerTemplateParams
  variables: ReplaceVariableProps
  parameterFormat?: "POSITIONAL" | "NAMED"
}): Promise<MessengerTemplateParams> {
  const { variables, templateParams } = props
  const replacedParams = { ...templateParams }

  if (templateParams.header) {
    replacedParams.header = await Promise.all(
      templateParams.header.map(async (param) => {
        if (param.type === "text" && param.text) {
          return {
            ...param,
            text: await contactVariableService.replaceAll({
              variables,
              text: param.text,
            }),
          }
        }
        return param
      }),
    )
  }

  if (templateParams.body) {
    replacedParams.body = await Promise.all(
      templateParams.body.map(async (param) => ({
        ...param,
        text: await contactVariableService.replaceAll({
          text: param.text,
          variables,
        }),
      })),
    )
  }

  return replacedParams
}

export async function validateMessengerTemplate(
  template: SendMessengerTemplateMessageStepSchema["template"],
  inboxId: string,
): Promise<boolean> {
  const inbox = await db.query.inboxModel.findFirst({
    where: { id: inboxId },
    with: { integrationMessenger: true },
  })

  if (!inbox?.integrationMessenger) {
    return false
  }

  const messengerTemplate =
    await db.query.messengerMessageTemplateModel.findFirst({
      where: {
        id: template.id,
        integrationMessengerId: inbox.integrationMessenger.id,
        status: "APPROVED",
      },
    })

  if (!messengerTemplate) {
    return false
  }

  return true
}
