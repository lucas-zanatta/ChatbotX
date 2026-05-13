import { MessengerSdkException } from "@chatbotx.io/sdk"

export const META_OAUTH_ERROR = {
  TYPE: "OAuthException",
  CODE: 190,
  SUBCODE: {
    PASSWORD_CHANGED: 460,
    TOKEN_EXPIRED: 463,
    TOKEN_INVALIDATED: 467,
    APP_NOT_INSTALLED: 458,
  },
} as const

const REVOKED_TOKEN_SUBCODES: readonly number[] = Object.values(
  META_OAUTH_ERROR.SUBCODE,
)

export class MessengerException extends MessengerSdkException {
  async isRevokedTokenError(): Promise<boolean> {
    const errorData = await this.getErrorData()

    return (
      errorData.type === META_OAUTH_ERROR.TYPE &&
      errorData.code === META_OAUTH_ERROR.CODE &&
      REVOKED_TOKEN_SUBCODES.includes(errorData.subcode as number)
    )
  }
}

export class MessengerAttachmentException extends MessengerException {
  readonly attachmentUrl?: string

  constructor(message: string, attachmentUrl?: string) {
    super(`Attachment error: ${message}`)
    this.attachmentUrl = attachmentUrl
  }
}

export class MessengerWebhookException extends MessengerException {
  readonly webhookData?: unknown

  constructor(message: string, webhookData?: unknown) {
    super(`Webhook error: ${message}`)
    this.webhookData = webhookData
  }
}

export class MessengerAPIException extends MessengerException {
  readonly apiEndpoint?: string

  constructor(message: string, apiEndpoint?: string) {
    super(`API error: ${message}`)
    this.apiEndpoint = apiEndpoint
  }
}
