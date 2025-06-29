import {
  countrySelectOptions,
  supportedLanguageSelectOptions,
  timezoneSelectOptions,
} from "@/lib/country"
import { z } from "zod"

export const updateChatbotBasicRequest = z.object({
  name: z.string().min(1).max(255),
})
export type UpdateChatbotBasicRequest = z.infer<
  typeof updateChatbotBasicRequest
>

export const updateChatbotAdvancedRequest = z.object({
  defaultReply: z.string().cuid2().nullish(),
  targetCountry: z.enum(
    Object.keys(countrySelectOptions) as [string, ...string[]],
  ),
  defaultLanguage: z.enum(
    Object.keys(supportedLanguageSelectOptions) as [string, ...string[]],
  ),
  accountTimezone: z.enum(
    Object.keys(timezoneSelectOptions) as [string, ...string[]],
  ),
  brandColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  developmentMode: z.boolean(),
})
export type UpdateChatbotAdvancedRequest = z.infer<
  typeof updateChatbotAdvancedRequest
>
