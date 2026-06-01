import { DEFAULT_API_VERSION } from "../constants"
import { rescue } from "../exception"
import { facebookGraphClient } from "../lib/http-client"
import type { MessengerAuthValue } from "../schema"

export type MessengerMessageTemplateEntity = {
  id: string
  name: string
  status: "APPROVED" | "PENDING" | "REJECTED"
  language: string
  category: "AUTHENTICATION" | "MARKETING" | "UTILITY"
  parameter_format?: string
  // biome-ignore lint/suspicious/noExplicitAny: Meta API shape varies
  components: any[]
}

export type ListMessengerMessageTemplatesResponse = {
  data: MessengerMessageTemplateEntity[]
  paging?: {
    next?: string
  }
}

export type CreateMessengerTemplateProps = {
  name: string
  language: string
  category: "AUTHENTICATION" | "MARKETING" | "UTILITY"
  parameter_format?: string
  // biome-ignore lint/suspicious/noExplicitAny: Meta API shape varies
  components: any[]
}

export const listPageMessageTemplates = (
  auth: MessengerAuthValue,
): Promise<ListMessengerMessageTemplatesResponse> => {
  const version = auth.metadata.version ?? DEFAULT_API_VERSION
  const pageId = auth.metadata.pageId
  const accessToken = auth.tokens.accessToken

  return rescue("message_templates", async () => {
    const allTemplates: MessengerMessageTemplateEntity[] = []
    let nextUrl: string | undefined =
      `/${version}/${pageId}/message_templates?fields=name,status,language,category,parameter_format,components`

    while (nextUrl) {
      const response: ListMessengerMessageTemplatesResponse =
        await facebookGraphClient.get(nextUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })

      allTemplates.push(...response.data)
      nextUrl = response.paging?.next
    }

    return {
      data: allTemplates,
      paging: {},
    }
  })
}

export const createPageMessageTemplate = (
  auth: MessengerAuthValue,
  data: CreateMessengerTemplateProps,
): Promise<MessengerMessageTemplateEntity> => {
  const version = auth.metadata.version ?? DEFAULT_API_VERSION
  const pageId = auth.metadata.pageId
  const endpoint = `${version}/${pageId}/message_templates`

  return rescue(endpoint, () =>
    facebookGraphClient.post(endpoint, {
      headers: {
        Authorization: `Bearer ${auth.tokens.accessToken}`,
        "Content-Type": "application/json",
      },
      json: data,
    }),
  )
}

export type CloneMessengerTemplateProps = {
  name: string
  category: "UTILITY"
  language: string
  library_template_name: string
  // Required by Meta when the library template has body/button placeholders —
  // counts must match the library template's components.
  // biome-ignore lint/suspicious/noExplicitAny: Meta library-input shape varies
  library_template_body_inputs?: any[]
  // biome-ignore lint/suspicious/noExplicitAny: Meta library-input shape varies
  library_template_button_inputs?: any[]
}

export const clonePageMessageTemplate = (
  auth: MessengerAuthValue,
  data: CloneMessengerTemplateProps,
): Promise<MessengerMessageTemplateEntity> => {
  const version = auth.metadata.version ?? DEFAULT_API_VERSION
  const pageId = auth.metadata.pageId
  const endpoint = `${version}/${pageId}/message_templates`

  return rescue(endpoint, () =>
    facebookGraphClient.post(endpoint, {
      headers: {
        Authorization: `Bearer ${auth.tokens.accessToken}`,
        "Content-Type": "application/json",
      },
      json: data,
    }),
  )
}
