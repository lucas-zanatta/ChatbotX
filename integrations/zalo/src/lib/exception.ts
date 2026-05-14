import type { ParsedError } from "@chatbotx.io/sdk"
import { SdkException, UNKNOWN_ERROR } from "@chatbotx.io/sdk"

export class ZaloException extends SdkException {
  getErrorData(): Promise<ParsedError> {
    // biome-ignore lint/suspicious/noExplicitAny: raw error shape
    const raw = this.originError as any
    // Shape from ZaloHttpClient: { response: { error: { error: number, message: string } } }
    const zaloError = raw?.response?.error

    if (zaloError) {
      return Promise.resolve({
        message: zaloError.message ?? UNKNOWN_ERROR.message,
        type: undefined,
        code: zaloError.error ?? UNKNOWN_ERROR.code,
        statusCode: UNKNOWN_ERROR.statusCode,
        subcode: UNKNOWN_ERROR.subcode,
      })
    }

    return Promise.resolve(UNKNOWN_ERROR)
  }
}

/**
 * Wraps an async function with standardized error handling
 */
export const handleZaloError = async <T>(
  operation: string,
  fn: () => Promise<T>,
): Promise<T> => {
  try {
    return await fn()
  } catch (error) {
    if (error instanceof ZaloException) {
      throw error
    }
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred"
    throw new ZaloException(
      `${operation} failed: ${errorMessage}`,
    ).setOriginError(error)
  }
}
