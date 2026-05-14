import { ChannelError, ChannelErrorCategory } from "@chatbotx.io/sdk"
import { WhatsappException } from "../exception"

type WaApiError = {
  code: number
  message?: string
  type?: string
  error_subcode?: number
  error_data?: number
}

function isWaApiError(v: unknown): v is WaApiError {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as WaApiError).code === "number"
  )
}

function extractWaFields(exc: WhatsappException): WaApiError {
  // biome-ignore lint/suspicious/noExplicitAny: raw error shape
  const raw = exc.originError as any
  return raw?.response?.error ?? {}
}

function mapWaFields(
  message: string,
  code: number | undefined,
  subcode: number | undefined,
  type: string | undefined,
): ChannelError {
  if (code === 130_429 || code === 131_048) {
    return new ChannelError(
      message,
      ChannelErrorCategory.RATE_LIMITED,
      code,
      429,
    )
  }

  if (code === 131_047) {
    return new ChannelError(
      message,
      ChannelErrorCategory.QUOTA_EXCEEDED,
      code,
      400,
      subcode,
    )
  }

  if (code === 131_031) {
    return new ChannelError(
      message,
      ChannelErrorCategory.USER_BLOCKED,
      code,
      403,
    )
  }

  if (code === 130_472) {
    return new ChannelError(
      message,
      ChannelErrorCategory.INVALID_RECIPIENT,
      code,
      400,
    )
  }

  if (code === 132_000 || code === 132_001) {
    return new ChannelError(
      message,
      ChannelErrorCategory.PAYLOAD_INVALID,
      code,
      400,
      subcode,
    )
  }

  if (code === 190 || code === 3 || code === 401 || type === "OAuthException") {
    return new ChannelError(
      message,
      ChannelErrorCategory.AUTH_FAILED,
      code ?? 190,
      401,
      subcode,
    )
  }

  if (code === 100) {
    return new ChannelError(
      message,
      ChannelErrorCategory.PAYLOAD_INVALID,
      code,
      400,
      subcode,
    )
  }

  return new ChannelError(
    message,
    ChannelErrorCategory.UNKNOWN,
    code ?? -1,
    400,
    subcode,
  )
}

export function mapToChannelError(rawError: unknown): ChannelError {
  if (rawError instanceof ChannelError) {
    return rawError
  }

  if (rawError instanceof WhatsappException) {
    const { code, type, error_subcode, error_data } = extractWaFields(rawError)
    return mapWaFields(
      rawError.message,
      code,
      error_subcode ?? error_data,
      type,
    )
  }

  if (isWaApiError(rawError)) {
    return mapWaFields(
      rawError.message ?? "Unknown error",
      rawError.code,
      rawError.error_subcode ?? rawError.error_data,
      rawError.type,
    )
  }

  const message = rawError instanceof Error ? rawError.message : "Unknown error"
  return new ChannelError(message, ChannelErrorCategory.UNKNOWN)
}
