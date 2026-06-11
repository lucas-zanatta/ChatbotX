import { SdkException, UNKNOWN_ERROR } from "../exception"
import type { ParsedError } from "../schemas"

export class MessengerSdkException extends SdkException {
  async getErrorData(): Promise<ParsedError> {
    const base = await super.getErrorData()

    // biome-ignore lint/suspicious/noExplicitAny: transport errors have non-uniform shapes
    const originError = this.originError as any
    if (!originError?.response) {
      return base
    }

    let body: any
    try {
      body = originError.response.error ?? (await originError.response.json())
    } catch {
      body = originError.response.error
    }

    const error = body?.error

    return {
      ...base,
      message: error?.message ?? base.message,
      code: error?.code ?? base.code,
      statusCode: body?.statusCode ?? base.statusCode,
      subcode: error?.subcode ?? base.subcode,
    }
  }
}
