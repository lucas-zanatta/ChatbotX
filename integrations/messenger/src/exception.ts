import type { ParsedError } from "@chatbotx.io/sdk"
import { SdkException, UNKNOWN_ERROR } from "@chatbotx.io/sdk"
import { logger } from "./lib/logger"

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

function extractFbError(originError: unknown): {
  code?: number
  type?: string
  message?: string
  subcode?: number
} {
  // biome-ignore lint/suspicious/noExplicitAny: raw error shape
  const raw = originError as any
  // Shape from buildOrigin: { httpStatus, errorBody: { error: { ... } } }
  const fromHttpClient = raw?.errorBody?.error
  if (fromHttpClient) {
    return fromHttpClient
  }

  // Shape from explicit setOriginError: { response: { error: { ... } } }
  const fromExplicit = raw?.response?.error
  if (fromExplicit) {
    return fromExplicit
  }

  return {}
}

export class MessengerException extends SdkException {
  getErrorData(): Promise<ParsedError> {
    const fbError = extractFbError(this.originError)

    if (fbError && Object.keys(fbError).length > 0) {
      return Promise.resolve({
        message: fbError.message ?? UNKNOWN_ERROR.message,
        type: fbError.type,
        code: fbError.code ?? UNKNOWN_ERROR.code,
        statusCode:
          (this.originError as { httpStatus?: number })?.httpStatus ??
          UNKNOWN_ERROR.statusCode,
        subcode: fbError.subcode ?? UNKNOWN_ERROR.subcode,
      })
    }

    logger.error(
      { originError: this.originError },
      "MessengerException: could not extract error data",
    )
    return Promise.resolve(UNKNOWN_ERROR)
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
