import ky, { type Options } from "ky"
import type { z } from "zod"
import { SEND_FOX_API_BASE_URL, SEND_FOX_HTTP_TIMEOUT_MS } from "./constants"
import { SendFoxApiError } from "./error"
import {
  type SendFoxAuthValue,
  sendFoxAuthSchema,
  sendFoxErrorSchema,
} from "./schemas"

export const getSendFoxClient = (auth: SendFoxAuthValue) =>
  ky.create({
    baseUrl: SEND_FOX_API_BASE_URL,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${auth.accessToken}`,
      "Content-Type": "application/json",
    },
    retry: 0,
    throwHttpErrors: false,
    timeout: SEND_FOX_HTTP_TIMEOUT_MS,
  })

export async function sendFoxRequest<T>(
  authValue: SendFoxAuthValue,
  endpoint: string,
  schema: z.ZodType<T>,
  options?: Options,
): Promise<T> {
  const auth = sendFoxAuthSchema.parse(authValue)
  const response = await getSendFoxClient(auth)(endpoint, options)
  const payload: unknown =
    response.status === 204
      ? undefined
      : await response.json().catch(() => undefined)

  if (!response.ok) {
    const parsed = sendFoxErrorSchema.safeParse(payload)
    const retryAfterHeader = response.headers.get("retry-after")
    const retryAfterSeconds = retryAfterHeader
      ? Number.parseInt(retryAfterHeader, 10)
      : undefined
    throw new SendFoxApiError({
      message:
        (parsed.success && parsed.data.message) ||
        `SendFox API returned ${response.status}`,
      statusCode: response.status,
      errors: parsed.success ? parsed.data.errors : undefined,
      retryAfterSeconds:
        retryAfterSeconds !== undefined &&
        Number.isSafeInteger(retryAfterSeconds) &&
        retryAfterSeconds >= 0
          ? retryAfterSeconds
          : undefined,
    })
  }

  return schema.parse(payload)
}
