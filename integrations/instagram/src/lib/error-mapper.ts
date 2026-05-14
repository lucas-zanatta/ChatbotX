import { ChannelError, ChannelErrorCategory } from "@chatbotx.io/sdk"
import { InstagramException } from "../exception"

type FbApiError = {
  code: number
  message?: string
  type?: string
  error_subcode?: number
  subcode?: number
}

type FbOrigin = {
  errorBody?: { error?: FbApiError }
  response?: { error?: FbApiError }
  httpStatus?: number
}

function isFbApiError(v: unknown): v is FbApiError {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as FbApiError).code === "number"
  )
}

function extractFbFields(exc: InstagramException): {
  code: number | undefined
  subcode: number | undefined
  type: string | undefined
  httpStatus: number | undefined
} {
  const raw = exc.originError as unknown as FbOrigin
  const fbError: Partial<FbApiError> =
    raw?.errorBody?.error ?? raw?.response?.error ?? {}
  return {
    code: fbError.code,
    subcode: fbError.error_subcode ?? fbError.subcode,
    type: fbError.type,
    httpStatus: raw?.httpStatus ?? exc.httpStatusCode,
  }
}

function mapFbFields(
  message: string,
  code: number | undefined,
  subcode: number | undefined,
  type: string | undefined,
  httpStatus: number | undefined,
): ChannelError {
  if (httpStatus === 429 || code === 613) {
    return new ChannelError(
      message,
      ChannelErrorCategory.RATE_LIMITED,
      code ?? 613,
      httpStatus ?? 429,
    )
  }

  if (httpStatus !== undefined && httpStatus >= 500) {
    return new ChannelError(
      message,
      ChannelErrorCategory.NETWORK_ERROR,
      code ?? httpStatus,
      httpStatus,
    )
  }

  // 190 OAuthException — invalid/revoked token
  if (code === 190 || type === "OAuthException") {
    return new ChannelError(
      message,
      ChannelErrorCategory.AUTH_FAILED,
      code ?? 190,
      httpStatus ?? 400,
      subcode,
    )
  }

  // 200 subcode 2018028 — 24h window quota
  if (code === 200 && subcode === 2_018_028) {
    return new ChannelError(
      message,
      ChannelErrorCategory.QUOTA_EXCEEDED,
      code,
      httpStatus ?? 400,
      subcode,
    )
  }

  // 10, 200, 368 — permission
  if (code === 10 || code === 200 || code === 368) {
    return new ChannelError(
      message,
      ChannelErrorCategory.PERMISSION_DENIED,
      code,
      httpStatus ?? 400,
      subcode,
    )
  }

  // 551 — user blocked / account unavailable
  if (code === 551) {
    return new ChannelError(
      message,
      ChannelErrorCategory.USER_BLOCKED,
      code,
      httpStatus ?? 400,
      subcode,
    )
  }

  // 100 — bad parameter; subcode 2018001 = invalid IGID
  if (code === 100) {
    if (subcode === 2_018_001) {
      return new ChannelError(
        message,
        ChannelErrorCategory.INVALID_RECIPIENT,
        code,
        httpStatus ?? 400,
        subcode,
      )
    }
    return new ChannelError(
      message,
      ChannelErrorCategory.PAYLOAD_INVALID,
      code,
      httpStatus ?? 400,
      subcode,
    )
  }

  return new ChannelError(
    message,
    ChannelErrorCategory.UNKNOWN,
    code ?? -1,
    httpStatus ?? 400,
    subcode,
  )
}

export function mapToChannelError(rawError: unknown): ChannelError {
  if (rawError instanceof ChannelError) {
    return rawError
  }

  if (rawError instanceof InstagramException) {
    const { code, subcode, type, httpStatus } = extractFbFields(rawError)
    return mapFbFields(rawError.message, code, subcode, type, httpStatus)
  }

  if (isFbApiError(rawError)) {
    return mapFbFields(
      rawError.message ?? "Unknown error",
      rawError.code,
      rawError.error_subcode ?? rawError.subcode,
      rawError.type,
      undefined,
    )
  }

  const message = rawError instanceof Error ? rawError.message : "Unknown error"
  return new ChannelError(message, ChannelErrorCategory.UNKNOWN)
}
