import type { ContactHandlers } from "@chatbotx.io/sdk"
import { getUserProfile } from "../apis/user"
import { InstagramAPIException } from "../exception"
import { logger } from "../lib/logger"
import type { InstagramAuthValue } from "../schemas"

const USER_PROFILE_CONSENT_REQUIRED_CODE = 230

const isUserProfileConsentRequired = (error: unknown) =>
  error instanceof InstagramAPIException &&
  error.code === USER_PROFILE_CONSENT_REQUIRED_CODE

export const contactHandlers: Partial<ContactHandlers<InstagramAuthValue>> = {
  getProfile: async ({ ctx, data: { sourceId } }) => {
    try {
      return await getUserProfile({ ctx, psid: sourceId })
    } catch (error) {
      if (!isUserProfileConsentRequired(error)) {
        throw error
      }

      logger.warn(
        { sourceId },
        "Instagram profile requires user consent; using sourceId fallback",
      )

      return { sourceId }
    }
  },
}
