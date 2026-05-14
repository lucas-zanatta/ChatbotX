import ky, { isHTTPError, type KyInstance } from "ky"
import { TelegramAPIException } from "../exception"
import { logger } from "./logger"

type TelegramErrorBody = {
  ok: false
  error_code?: number
  description?: string
}

class TelegramHttpClient {
  private readonly client: KyInstance

  constructor(botToken: string) {
    this.client = ky.create({
      baseUrl: `https://api.telegram.org/bot${botToken}/`,
      timeout: 30_000,
      retry: {
        limit: 3,
        methods: ["get", "post"],
        statusCodes: [408, 413, 429, 500, 502, 503, 504],
        backoffLimit: 1000,
      },
      hooks: {
        beforeError: [
          ({ error, request }) => {
            if (isHTTPError(error)) {
              logger.error(
                {
                  url: request.url,
                  method: request.method,
                },
                `HTTP ${error.response.status}: ${error.response.statusText}`,
              )
            }
            return error
          },
        ],
      },
    })
  }

  private async buildException(
    endpoint: string,
    error: unknown,
  ): Promise<TelegramAPIException> {
    if (isHTTPError(error)) {
      let body: TelegramErrorBody | undefined
      try {
        body = (await error.response.clone().json()) as TelegramErrorBody
      } catch {
        // response body unreadable — proceed without it
      }
      const description = body?.description ?? `${endpoint} failed`
      const httpStatus = error.response.status
      const errorCode = body?.error_code ?? httpStatus
      return new TelegramAPIException(
        description,
        endpoint,
        httpStatus,
        errorCode,
      ).setOriginError(error) as TelegramAPIException
    }
    return new TelegramAPIException(
      `${endpoint} failed: ${String(error)}`,
      endpoint,
    ).setOriginError(error) as TelegramAPIException
  }

  async post<T>(endpoint: string, options?: { json?: unknown }): Promise<T> {
    try {
      return await this.client.post(endpoint, options).json<T>()
    } catch (error) {
      throw await this.buildException(endpoint, error)
    }
  }

  async get<T>(
    endpoint: string,
    options?: { searchParams?: Record<string, string> },
  ): Promise<T> {
    try {
      return await this.client.get(endpoint, options).json<T>()
    } catch (error) {
      throw await this.buildException(endpoint, error)
    }
  }
}

export const createTelegramClient = (botToken: string): TelegramHttpClient =>
  new TelegramHttpClient(botToken)
