import {
  type ChannelErrorCategory,
  PERMANENT_CATEGORIES,
  RETRYABLE_CATEGORIES,
} from "./channel-error-codes"
import { SdkException } from "./exception"
import type { ParsedError } from "./schemas"

export class ChannelError extends SdkException {
  readonly category: ChannelErrorCategory
  readonly isRetryable: boolean
  readonly isPermanent: boolean

  constructor(
    message: string,
    category: ChannelErrorCategory,
    code: string | number = -1,
    httpStatusCode = 400,
    subCode?: string | number | null,
  ) {
    super(message, "channelError", httpStatusCode)
    // Override base class fields with actual typed values
    this.code = code
    this.subCode = subCode ?? null
    this.category = category
    this.isRetryable = RETRYABLE_CATEGORIES.has(category)
    this.isPermanent = PERMANENT_CATEGORIES.has(category)
  }

  getErrorData(): Promise<ParsedError> {
    return Promise.resolve({
      message: this.message,
      type: this.type,
      code: this.code,
      statusCode: this.httpStatusCode,
      subcode: this.subCode ?? -1,
      category: this.category,
      isRetryable: this.isRetryable,
      isPermanent: this.isPermanent,
    })
  }
}
