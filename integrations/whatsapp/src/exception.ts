import type { ParsedError } from "@chatbotx.io/sdk"
import { SdkException, UNKNOWN_ERROR } from "@chatbotx.io/sdk"

export const WHATSAPP_GRAPH_ERROR = {
  TYPE: "GraphMethodException",
  CODE: 100,
  SUBCODE: {
    INVALID_PARAMETER: 33,
  },
} as const

export class WhatsappException extends SdkException {
  getErrorData(): Promise<ParsedError> {
    // biome-ignore lint/suspicious/noExplicitAny: raw error shape
    const raw = this.originError as any
    // Shape: { response: { error: { code, type, message, error_subcode, ... } } }
    const waError = raw?.response?.error

    if (waError) {
      return Promise.resolve({
        message: waError.message ?? UNKNOWN_ERROR.message,
        type: waError.type,
        code: waError.code ?? UNKNOWN_ERROR.code,
        statusCode: waError.status ?? UNKNOWN_ERROR.statusCode,
        subcode:
          waError.error_subcode ?? waError.error_data ?? UNKNOWN_ERROR.subcode,
      })
    }

    return Promise.resolve(UNKNOWN_ERROR)
  }
}
