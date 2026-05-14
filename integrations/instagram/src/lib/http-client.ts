import ky, { isHTTPError, type KyInstance } from "ky"
import { InstagramAPIException } from "../exception"
import { logger } from "./logger"

type FbErrorOrigin = {
  httpStatus: number
  errorBody:
    | {
        error?: {
          code?: number
          type?: string
          message?: string
          error_subcode?: number
          subcode?: number
        }
      }
    | undefined
}

type HttpClientConfig = {
  baseUrl: string
  timeout?: number
  retries?: number
  retryDelay?: number
}

class InstagramHttpClient {
  private readonly client: KyInstance

  constructor(config: HttpClientConfig) {
    this.client = ky.create({
      baseUrl: config.baseUrl,
      timeout: config.timeout ?? 30_000,
      retry: {
        limit: config.retries ?? 3,
        methods: ["get", "post", "put", "delete"],
        statusCodes: [408, 413, 429, 500, 502, 503, 504],
        backoffLimit: config.retryDelay ?? 1000,
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

  private async buildOrigin(
    error: unknown,
  ): Promise<FbErrorOrigin | undefined> {
    if (isHTTPError(error)) {
      let errorBody: FbErrorOrigin["errorBody"]
      try {
        errorBody = (await error.response
          .clone()
          .json()) as FbErrorOrigin["errorBody"]
      } catch {
        // response body unreadable — proceed without it
      }
      return { httpStatus: error.response.status, errorBody }
    }
    return
  }

  async get<T>(
    url: string,
    options?: {
      headers?: Record<string, string>
      searchParams?: Record<string, string>
    },
  ): Promise<T> {
    try {
      return await this.client.get(url, options).json<T>()
    } catch (error) {
      const origin = await this.buildOrigin(error)
      const message =
        origin?.errorBody?.error?.message ??
        (error instanceof Error ? error.message : "Unknown error")
      throw new InstagramAPIException(
        `GET request failed: ${message}`,
        url,
      ).setOriginError(origin ?? error)
    }
  }

  async post<T>(
    url: string,
    options?: {
      headers?: Record<string, string>
      json?: unknown
      body?: URLSearchParams | string
      searchParams?: Record<string, string>
    },
  ): Promise<T> {
    try {
      return await this.client.post(url, options).json<T>()
    } catch (error) {
      const origin = await this.buildOrigin(error)
      const message =
        origin?.errorBody?.error?.message ??
        (error instanceof Error ? error.message : "Unknown error")
      throw new InstagramAPIException(
        `POST request failed: ${message}`,
        url,
      ).setOriginError(origin ?? error)
    }
  }

  async delete<T>(
    url: string,
    options?: {
      headers?: Record<string, string>
      searchParams?: Record<string, string>
      json?: unknown
    },
  ): Promise<T> {
    try {
      return await this.client.delete(url, options).json<T>()
    } catch (error) {
      const origin = await this.buildOrigin(error)
      const message =
        origin?.errorBody?.error?.message ??
        (error instanceof Error ? error.message : "Unknown error")
      throw new InstagramAPIException(
        `DELETE request failed: ${message}`,
        url,
      ).setOriginError(origin ?? error)
    }
  }
}

// Create singleton instances for different API endpoints
export const instagramGraphClient = new InstagramHttpClient({
  baseUrl: "https://graph.facebook.com",
  timeout: 30_000,
  retries: 3,
  retryDelay: 1000,
})

export const instagramAttachmentClient = new InstagramHttpClient({
  baseUrl: "https://graph.facebook.com",
  timeout: 60_000,
  retries: 2,
  retryDelay: 2000,
})
