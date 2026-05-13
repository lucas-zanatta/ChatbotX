import { MessengerSdkException } from "@chatbotx.io/sdk"

export const WHATSAPP_GRAPH_ERROR = {
  TYPE: "GraphMethodException",
  CODE: 100,
  SUBCODE: {
    INVALID_PARAMETER: 33,
  },
} as const

export class WhatsappException extends MessengerSdkException {
  async isRevokedTokenError(): Promise<boolean> {
    const errorData = await this.getErrorData()

    return (
      errorData.type === WHATSAPP_GRAPH_ERROR.TYPE &&
      errorData.code === WHATSAPP_GRAPH_ERROR.CODE &&
      errorData.subcode === WHATSAPP_GRAPH_ERROR.SUBCODE.INVALID_PARAMETER
    )
  }
}
