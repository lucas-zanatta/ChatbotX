import { ChannelError, ChannelErrorCategory } from "@chatbotx.io/sdk"
import { ZaloException } from "./exception"

type ZaloApiError = {
  error: number
  message?: string
}

function isZaloApiError(v: unknown): v is ZaloApiError {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as ZaloApiError).error === "number"
  )
}

function extractZaloCode(exc: ZaloException): number | undefined {
  const raw = exc.originError as unknown as {
    response?: { error?: ZaloApiError }
  }
  return raw?.response?.error?.error
}

function mapZaloCode(message: string, code: number | undefined): ChannelError {
  switch (code) {
    case -214:
      return new ChannelError(
        message,
        ChannelErrorCategory.RATE_LIMITED,
        code,
        429,
      )
    case -201:
    case -215:
      return new ChannelError(
        message,
        ChannelErrorCategory.QUOTA_EXCEEDED,
        code,
        400,
      )
    case -200:
    case -216:
      return new ChannelError(
        message,
        ChannelErrorCategory.INVALID_RECIPIENT,
        code,
        400,
      )
    case -217:
      return new ChannelError(
        message,
        ChannelErrorCategory.USER_BLOCKED,
        code,
        403,
      )
    case -204:
      return new ChannelError(
        message,
        ChannelErrorCategory.PERMISSION_DENIED,
        code,
        403,
      )
    default:
      return new ChannelError(
        message,
        ChannelErrorCategory.UNKNOWN,
        code ?? -1,
        400,
      )
  }
}

export function mapToChannelError(rawError: unknown): ChannelError {
  if (rawError instanceof ChannelError) {
    return rawError
  }

  if (rawError instanceof ZaloException) {
    return mapZaloCode(rawError.message, extractZaloCode(rawError))
  }

  if (isZaloApiError(rawError)) {
    return mapZaloCode(rawError.message ?? "Unknown error", rawError.error)
  }

  const message = rawError instanceof Error ? rawError.message : "Unknown error"
  return new ChannelError(message, ChannelErrorCategory.UNKNOWN)
}
