import { SdkException } from "@chatbotx.io/sdk"

export class SendFoxApiError extends SdkException {
  readonly errors?: Record<string, string[]>
  readonly retryAfterSeconds?: number
  readonly statusCode: number

  constructor(props: {
    message: string
    statusCode: number
    errors?: Record<string, string[]>
    retryAfterSeconds?: number
  }) {
    super(props.message, props.statusCode, props.statusCode)
    this.name = "SendFoxApiError"
    this.statusCode = props.statusCode
    this.errors = props.errors
    this.retryAfterSeconds = props.retryAfterSeconds
  }
}
