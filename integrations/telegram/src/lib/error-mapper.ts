import { ChannelError, ChannelErrorCategory } from "@chatbotx.io/sdk"
import { TelegramAPIException } from "../exception"

const USER_BLOCKED_DESCRIPTIONS = [
  "bot was blocked by the user",
  "bot can't initiate conversation with a user",
  "bot can't send messages to bots",
]

const INVALID_RECIPIENT_DESCRIPTIONS = [
  "user is deactivated",
  "chat not found",
  "the group chat was deleted",
  "chat_id is empty",
  "peer_id_invalid",
]

const API_ERROR_PREFIX = /^API error: /

type TelegramApiError = {
  error_code: number
  description?: string
}

function isTelegramApiError(v: unknown): v is TelegramApiError {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as TelegramApiError).error_code === "number"
  )
}

function mapTelegramStatus(
  message: string,
  code: number,
  httpStatus: number,
  description: string,
): ChannelError {
  if (httpStatus === 429) {
    return new ChannelError(
      message,
      ChannelErrorCategory.RATE_LIMITED,
      code,
      httpStatus,
    )
  }

  if (httpStatus === 401) {
    return new ChannelError(
      message,
      ChannelErrorCategory.AUTH_FAILED,
      code,
      httpStatus,
    )
  }

  if (httpStatus === 403) {
    if (USER_BLOCKED_DESCRIPTIONS.some((d) => description.includes(d))) {
      return new ChannelError(
        message,
        ChannelErrorCategory.USER_BLOCKED,
        code,
        httpStatus,
      )
    }
    if (INVALID_RECIPIENT_DESCRIPTIONS.some((d) => description.includes(d))) {
      return new ChannelError(
        message,
        ChannelErrorCategory.INVALID_RECIPIENT,
        code,
        httpStatus,
      )
    }
    // Default 403 → user blocked (most common Telegram 403 cause)
    return new ChannelError(
      message,
      ChannelErrorCategory.USER_BLOCKED,
      code,
      httpStatus,
    )
  }

  if (httpStatus === 400) {
    if (INVALID_RECIPIENT_DESCRIPTIONS.some((d) => description.includes(d))) {
      return new ChannelError(
        message,
        ChannelErrorCategory.INVALID_RECIPIENT,
        code,
        httpStatus,
      )
    }
    return new ChannelError(
      message,
      ChannelErrorCategory.PAYLOAD_INVALID,
      code,
      httpStatus,
    )
  }

  if (httpStatus >= 500) {
    return new ChannelError(
      message,
      ChannelErrorCategory.NETWORK_ERROR,
      code,
      httpStatus,
    )
  }

  return new ChannelError(
    message,
    ChannelErrorCategory.UNKNOWN,
    code,
    httpStatus,
  )
}

export function mapToChannelError(rawError: unknown): ChannelError {
  if (rawError instanceof ChannelError) {
    return rawError
  }

  if (rawError instanceof TelegramAPIException) {
    const httpStatus = rawError.httpStatusCode
    const description = rawError.message
      .replace(API_ERROR_PREFIX, "")
      .toLowerCase()
    return mapTelegramStatus(
      rawError.message,
      rawError.code as number,
      httpStatus,
      description,
    )
  }

  if (isTelegramApiError(rawError)) {
    // Telegram error_code mirrors the HTTP status code
    const httpStatus = rawError.error_code
    const description = (rawError.description ?? "").toLowerCase()
    return mapTelegramStatus(
      rawError.description ?? "Unknown error",
      rawError.error_code,
      httpStatus,
      description,
    )
  }

  const message = rawError instanceof Error ? rawError.message : "Unknown error"
  return new ChannelError(message, ChannelErrorCategory.UNKNOWN)
}
